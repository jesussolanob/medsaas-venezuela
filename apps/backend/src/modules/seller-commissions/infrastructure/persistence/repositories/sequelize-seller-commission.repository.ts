import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type {
  ISellerCommissionRepository,
  AccrueCommissionParams,
  AssignSpecialistParams,
  CommissionRow,
  PendingBySeller,
  PendingCommissionDetail,
  RegisterPaymentParams,
  SpecialistCommissionProfile,
} from '../../../domain/repositories/seller-commission.repository';
import { InvalidCommissionIdsError } from '../../../domain/errors/invalid-commission-ids.error';
import type {
  CommissionType,
  CommissionStatus,
} from '../../../domain/entities/seller-commission.entity';
import { SellerPayment } from '../../../domain/entities/seller-payment.entity';
import { SellerCommissionModel } from '../models/seller-commission.model';
import { SellerPaymentModel } from '../models/seller-payment.model';
import { CommissionProfileModel } from '../models/commission-profile.model';

// ---------------------------------------------------------------------------
// Raw SQL row shapes
// ---------------------------------------------------------------------------

interface CommissionJoinRow {
  id: string;
  seller_id: string;
  specialist_id: string;
  specialist_name: string;
  type: string;
  amount_usd: string;
  plan_key: string | null;
  status: string;
  earned_at: Date;
  payment_id: string | null;
  created_at: Date;
}

interface PendingBySellerRow {
  seller_id: string;
  seller_name: string;
  /** NUMERIC — pg lo devuelve como string, siempre parseFloat antes de sumar. */
  total_pending_usd: string;
  /** Casteado a ::int en la query, así que llega como number. */
  pending_count: number;
}

interface SpecialistProfileRow {
  specialist_id: string;
  sold_by: string | null;
  sold_by_source: string | null;
  seller_is_active: boolean | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCommissionRow(r: CommissionJoinRow): CommissionRow {
  return {
    id: r.id,
    sellerId: r.seller_id,
    specialistId: r.specialist_id,
    specialistName: r.specialist_name,
    type: r.type as CommissionType,
    amountUsd: parseFloat(r.amount_usd),
    planKey: r.plan_key,
    status: r.status as CommissionStatus,
    earnedAt: r.earned_at,
    paymentId: r.payment_id,
    createdAt: r.created_at,
  };
}

function modelToPayment(row: SellerPaymentModel): SellerPayment {
  // pg returns NUMERIC columns as strings — parseFloat before any arithmetic.
  const bcvRate =
    row.bcvRate !== null && row.bcvRate !== undefined ? parseFloat(row.bcvRate) : null;
  return new SellerPayment(
    row.id,
    row.sellerId,
    parseFloat(row.amountUsd),
    row.method,
    row.reference,
    row.receiptUrl,
    row.notes,
    row.paidAt,
    row.createdBy,
    row.createdAt,
    bcvRate,
  );
}

// ---------------------------------------------------------------------------
// Repository implementation
// ---------------------------------------------------------------------------

@Injectable()
export class SequelizeSellerCommissionRepository implements ISellerCommissionRepository {
  constructor(
    @InjectModel(SellerCommissionModel)
    private readonly commissionModel: typeof SellerCommissionModel,
    @InjectModel(SellerPaymentModel)
    private readonly paymentModel: typeof SellerPaymentModel,
    @InjectModel(CommissionProfileModel)
    private readonly profileModel: typeof CommissionProfileModel,
    private readonly sequelize: Sequelize,
  ) {}

  // ---------------------------------------------------------------------------
  // findSpecialistCommissionProfile
  // ---------------------------------------------------------------------------

  async findSpecialistCommissionProfile(
    specialistId: string,
  ): Promise<SpecialistCommissionProfile | null> {
    // We need both the specialist's attribution data AND the seller's is_active flag.
    // A LEFT JOIN allows the case where sold_by IS NULL (no seller attributed).
    const rows = await this.sequelize.query<SpecialistProfileRow>(
      `SELECT
         sp.id               AS specialist_id,
         sp.sold_by,
         sp.sold_by_source,
         sl.is_active        AS seller_is_active
       FROM profiles sp
       LEFT JOIN profiles sl ON sl.id = sp.sold_by
       WHERE sp.id = :specialistId
       LIMIT 1`,
      {
        replacements: { specialistId },
        type: QueryTypes.SELECT,
      },
    );

    if (!rows[0]) return null;
    const r = rows[0];

    return {
      specialistId: r.specialist_id,
      soldBy: r.sold_by,
      soldBySource: r.sold_by_source,
      // When soldBy is null, sellerIsActive defaults to false (no seller to check).
      sellerIsActive: r.seller_is_active ?? false,
    };
  }

  // ---------------------------------------------------------------------------
  // accrueCommission
  // ---------------------------------------------------------------------------

  async accrueCommission(params: AccrueCommissionParams): Promise<'created' | 'duplicate'> {
    // ON CONFLICT DO NOTHING implements the idempotency guarantee.
    // The UNIQUE(specialist_id, type) constraint is the enforcer.
    const [, affectedRows] = await this.sequelize.query(
      `INSERT INTO seller_commissions
         (id, seller_id, specialist_id, type, amount_usd, plan_key, status, earned_at, created_at)
       VALUES
         (:id, :sellerId, :specialistId, :type, :amountUsd, :planKey, 'pending', :earnedAt, NOW())
       ON CONFLICT (specialist_id, type) DO NOTHING`,
      {
        replacements: {
          id: randomUUID(),
          sellerId: params.sellerId,
          specialistId: params.specialistId,
          type: params.type,
          amountUsd: params.amountUsd,
          planKey: params.planKey,
          earnedAt: params.earnedAt.toISOString(),
        },
        type: QueryTypes.INSERT,
      },
    );

    // Sequelize returns [result, affectedRows] for INSERT. If affectedRows is 0,
    // the conflict clause triggered and no row was inserted.
    return (affectedRows as number) > 0 ? 'created' : 'duplicate';
  }

  // ---------------------------------------------------------------------------
  // listCommissionsBySeller
  // ---------------------------------------------------------------------------

  async listCommissionsBySeller(sellerId: string): Promise<CommissionRow[]> {
    const rows = await this.sequelize.query<CommissionJoinRow>(
      `SELECT
         c.id,
         c.seller_id,
         c.specialist_id,
         p.full_name     AS specialist_name,
         c.type,
         c.amount_usd,
         c.plan_key,
         c.status,
         c.earned_at,
         c.payment_id,
         c.created_at
       FROM seller_commissions c
       JOIN profiles p ON p.id = c.specialist_id
       WHERE c.seller_id = :sellerId
       ORDER BY c.earned_at DESC`,
      {
        replacements: { sellerId },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map(toCommissionRow);
  }

  // ---------------------------------------------------------------------------
  // listPendingBySeller
  // ---------------------------------------------------------------------------

  async listPendingBySeller(): Promise<PendingBySeller[]> {
    // 1. Aggregate pending commissions by seller
    const summaryRows = await this.sequelize.query<PendingBySellerRow>(
      `SELECT
         c.seller_id,
         p.full_name           AS seller_name,
         SUM(c.amount_usd)     AS total_pending_usd,
         COUNT(*)::int         AS pending_count
       FROM seller_commissions c
       JOIN profiles p ON p.id = c.seller_id
       WHERE c.status = 'pending'
       GROUP BY c.seller_id, p.full_name
       ORDER BY total_pending_usd DESC`,
      { type: QueryTypes.SELECT },
    );

    if (summaryRows.length === 0) return [];

    // 2. Load detail rows for those sellers
    const sellerIds = summaryRows.map((r) => r.seller_id);
    const detailRows = await this.sequelize.query<CommissionJoinRow>(
      `SELECT
         c.id,
         c.seller_id,
         c.specialist_id,
         p.full_name     AS specialist_name,
         c.type,
         c.amount_usd,
         c.plan_key,
         c.status,
         c.earned_at,
         c.payment_id,
         c.created_at
       FROM seller_commissions c
       JOIN profiles p ON p.id = c.specialist_id
       WHERE c.seller_id IN (:sellerIds)
         AND c.status = 'pending'
       ORDER BY c.earned_at DESC`,
      {
        replacements: { sellerIds },
        type: QueryTypes.SELECT,
      },
    );

    // 3. Group detail rows by seller
    const detailBySeller = new Map<string, PendingCommissionDetail[]>();
    for (const d of detailRows) {
      const arr = detailBySeller.get(d.seller_id) ?? [];
      arr.push({
        commissionId: d.id,
        specialistId: d.specialist_id,
        specialistName: d.specialist_name,
        type: d.type as CommissionType,
        amountUsd: parseFloat(d.amount_usd),
        planKey: d.plan_key,
        earnedAt: d.earned_at,
      });
      detailBySeller.set(d.seller_id, arr);
    }

    return summaryRows.map((s) => ({
      sellerId: s.seller_id,
      sellerName: s.seller_name,
      totalPendingUsd: parseFloat(s.total_pending_usd),
      pendingCount: s.pending_count,
      commissions: detailBySeller.get(s.seller_id) ?? [],
    }));
  }

  // ---------------------------------------------------------------------------
  // findCommissionsForPayment
  // ---------------------------------------------------------------------------

  async findCommissionsForPayment(
    sellerId: string,
    commissionIds: string[],
  ): Promise<CommissionRow[]> {
    if (commissionIds.length === 0) {
      throw new InvalidCommissionIdsError();
    }

    const rows = await this.sequelize.query<CommissionJoinRow>(
      `SELECT
         c.id,
         c.seller_id,
         c.specialist_id,
         p.full_name     AS specialist_name,
         c.type,
         c.amount_usd,
         c.plan_key,
         c.status,
         c.earned_at,
         c.payment_id,
         c.created_at
       FROM seller_commissions c
       JOIN profiles p ON p.id = c.specialist_id
       WHERE c.id IN (:commissionIds)
         AND c.seller_id = :sellerId
         AND c.status = 'pending'`,
      {
        replacements: { commissionIds, sellerId },
        type: QueryTypes.SELECT,
      },
    );

    // If any ID was invalid, paid, or from another seller — partial match → error.
    if (rows.length !== commissionIds.length) {
      throw new InvalidCommissionIdsError();
    }

    return rows.map(toCommissionRow);
  }

  // ---------------------------------------------------------------------------
  // registerPayment (transactional)
  // ---------------------------------------------------------------------------

  async registerPayment(params: RegisterPaymentParams, adminId: string): Promise<SellerPayment> {
    // Calculate amount from the commission rows (already validated by use case).
    // We re-query inside the transaction to prevent a TOCTOU race condition where
    // another request pays the same commission between validation and this step.
    const t = await this.sequelize.transaction();

    try {
      // Re-validate inside the transaction (prevents TOCTOU).
      const commissions = await this.commissionModel.findAll({
        where: { id: params.commissionIds, sellerId: params.sellerId, status: 'pending' },
        transaction: t,
        lock: true,
      });

      if (commissions.length !== params.commissionIds.length) {
        await t.rollback();
        throw new InvalidCommissionIdsError();
      }

      const amountUsd = commissions.reduce((sum, c) => sum + parseFloat(c.amountUsd), 0);

      // 1. Create the payment row.
      const paymentId = randomUUID();
      await this.paymentModel.create(
        {
          id: paymentId,
          sellerId: params.sellerId,
          amountUsd,
          method: params.method,
          reference: params.reference,
          receiptUrl: params.receiptUrl,
          notes: params.notes,
          paidAt: params.paidAt,
          bcvRate: params.bcvRate,
          createdBy: adminId,
          createdAt: new Date(),
        } as Parameters<typeof SellerPaymentModel.create>[0],
        { transaction: t },
      );

      // 2. Mark commissions as paid.
      // El WHERE repite sellerId y status aunque el SELECT con lock de arriba ya
      // los validó: si alguien reordena estas dos operaciones en el futuro, el
      // UPDATE sigue sin poder tocar la comisión de otro vendedor ni repisar una
      // ya pagada. Defensa en profundidad sobre plata.
      await this.commissionModel.update(
        { status: 'paid', paymentId } as Partial<SellerCommissionModel>,
        {
          where: {
            id: params.commissionIds,
            sellerId: params.sellerId,
            status: 'pending',
          },
          transaction: t,
        },
      );

      await t.commit();

      return new SellerPayment(
        paymentId,
        params.sellerId,
        amountUsd,
        params.method,
        params.reference,
        params.receiptUrl,
        params.notes,
        params.paidAt,
        adminId,
        new Date(),
        params.bcvRate,
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // listPaymentsBySeller
  // ---------------------------------------------------------------------------

  async listPaymentsBySeller(sellerId: string): Promise<SellerPayment[]> {
    const rows = await this.paymentModel.findAll({
      where: { sellerId },
      order: [['paidAt', 'DESC']],
    });

    return rows.map(modelToPayment);
  }

  // ---------------------------------------------------------------------------
  // findPaymentById
  // ---------------------------------------------------------------------------

  async findPaymentById(paymentId: string): Promise<SellerPayment | null> {
    const row = await this.paymentModel.findOne({ where: { id: paymentId } });
    return row ? modelToPayment(row) : null;
  }

  // ---------------------------------------------------------------------------
  // findSellerById / findSpecialistById
  // ---------------------------------------------------------------------------

  async findSellerById(sellerId: string): Promise<{ id: string; isActive: boolean } | null> {
    const row = await this.profileModel.findOne({
      where: { id: sellerId, role: 'seller' },
    });
    if (!row) return null;
    return { id: row.id, isActive: row.isActive ?? true };
  }

  async findSpecialistById(
    specialistId: string,
  ): Promise<{ id: string; soldBy: string | null } | null> {
    const row = await this.profileModel.findOne({
      where: { id: specialistId, role: 'doctor' },
    });
    if (!row) return null;
    return { id: row.id, soldBy: row.soldBy };
  }

  // ---------------------------------------------------------------------------
  // assignSpecialistToSeller
  // ---------------------------------------------------------------------------

  async assignSpecialistToSeller(params: AssignSpecialistParams): Promise<void> {
    const t = await this.sequelize.transaction();

    try {
      // 1. Update the specialist's profile (no WHERE sold_by IS NULL — admin override).
      await this.profileModel.update(
        {
          soldBy: params.newSellerId,
          soldBySource: 'admin',
        } as Partial<CommissionProfileModel>,
        {
          where: { id: params.specialistId },
          transaction: t,
        },
      );

      // 2. Insert attribution log row.
      await this.sequelize.query(
        `INSERT INTO seller_attribution_logs
           (id, specialist_id, from_seller_id, to_seller_id, assigned_by, assigned_at)
         VALUES
           (:id, :specialistId, :fromSellerId, :toSellerId, :assignedBy, NOW())`,
        {
          replacements: {
            id: randomUUID(),
            specialistId: params.specialistId,
            fromSellerId: params.previousSellerId,
            toSellerId: params.newSellerId,
            assignedBy: params.assignedBy,
          },
          transaction: t,
          type: QueryTypes.INSERT,
        },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}
