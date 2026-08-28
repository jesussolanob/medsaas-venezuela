import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type {
  ISellerRepository,
  SellerProfile,
  SellerAdminRow,
  SellerSpecialistRow,
  CreateSellerParams,
  CreateSoldSpecialistParams,
} from '../../../domain/repositories/seller.repository';
import { SellerProfileModel } from '../models/seller-profile.model';
import { SpecialistEmailConflictError } from '../../../domain/errors/specialist-email-conflict.error';

/** Trial duration in days — matches the value used throughout the platform. */
const TRIAL_DURATION_DAYS = 30;

@Injectable()
export class SequelizeSellerRepository implements ISellerRepository {
  constructor(
    @InjectModel(SellerProfileModel)
    private readonly profileModel: typeof SellerProfileModel,
    private readonly sequelize: Sequelize,
  ) {}

  // ---------------------------------------------------------------------------
  // Seller profile management
  // ---------------------------------------------------------------------------

  async createSeller(params: CreateSellerParams): Promise<SellerProfile> {
    try {
      const row = await this.profileModel.create({
        id: params.id,
        fullName: params.fullName,
        email: params.email,
        role: 'seller',
        isActive: true,
        sellerCode: params.sellerCode,
        soldBy: null,
        plan: null,
        subscriptionStatus: null,
        specialty: null,
      } as Parameters<typeof SellerProfileModel.create>[0]);

      return {
        id: row.id,
        fullName: row.fullName,
        sellerCode: row.sellerCode!,
        createdAt: row.createdAt,
      };
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        // Unique violations can be on email OR seller_code (unlikely on code but handled).
        const existing = await this.profileModel.findOne({
          where: { email: { [Op.iLike]: params.email } },
        });
        if (existing) throw new SpecialistEmailConflictError();
      }
      throw err;
    }
  }

  async findById(id: string): Promise<SellerProfile | null> {
    const row = await this.profileModel.findOne({
      where: { id, role: 'seller' },
    });
    if (!row) return null;
    return {
      id: row.id,
      fullName: row.fullName,
      sellerCode: row.sellerCode!,
      createdAt: row.createdAt,
    };
  }

  async findByCode(code: string): Promise<SellerProfile | null> {
    const row = await this.profileModel.findOne({
      where: { sellerCode: code, role: 'seller', isActive: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      fullName: row.fullName,
      sellerCode: row.sellerCode!,
      createdAt: row.createdAt,
    };
  }

  async codeExists(code: string): Promise<boolean> {
    const count = await this.profileModel.count({ where: { sellerCode: code } });
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Specialist (sold_by) management
  // ---------------------------------------------------------------------------

  /**
   * Listado de vendedores para `/admin/sellers`.
   *
   * Son DOS consultas fijas (no N+1): los vendedores, y de una sola vez los
   * especialistas de todos ellos. El conteo se hace en memoria.
   *
   * A propósito NO se usa `GROUP BY` con `fn('COUNT', col('id'))`: por ese
   * camino Sequelize no mapea el atributo `soldBy` a la columna real `sold_by`
   * y genera `SELECT "soldBy" … GROUP BY "sold_by"`, que Postgres rechaza —
   * fue el 500 del primer intento. El volumen acá es de decenas de filas, así
   * que contar en JS sale gratis y usa solo construcciones ya probadas.
   */
  async listSellers(): Promise<SellerAdminRow[]> {
    const sellers = await this.profileModel.findAll({
      where: { role: 'seller' },
      order: [['createdAt', 'DESC']],
    });
    if (sellers.length === 0) return [];

    const sold = await this.profileModel.findAll({
      where: { soldBy: { [Op.in]: sellers.map((s) => s.id) } },
    });

    const bySeller = new Map<string, number>();
    for (const row of sold) {
      if (!row.soldBy) continue;
      bySeller.set(row.soldBy, (bySeller.get(row.soldBy) ?? 0) + 1);
    }

    return sellers.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      sellerCode: s.sellerCode ?? '',
      specialistsCount: bySeller.get(s.id) ?? 0,
      createdAt: s.createdAt,
      lastSignInAt: s.lastSignInAt,
    }));
  }

  async listSoldSpecialists(sellerId: string): Promise<SellerSpecialistRow[]> {
    const rows = await this.profileModel.findAll({
      where: { soldBy: sellerId },
      order: [['createdAt', 'DESC']],
    });

    return rows.map(toSpecialistRow);
  }

  async findSoldSpecialist(
    sellerId: string,
    specialistId: string,
  ): Promise<SellerSpecialistRow | null> {
    const row = await this.profileModel.findOne({
      where: { id: specialistId, soldBy: sellerId },
    });
    if (!row) return null;
    return toSpecialistRow(row);
  }

  async createSoldSpecialist(params: CreateSoldSpecialistParams): Promise<SellerSpecialistRow> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + TRIAL_DURATION_DAYS);

    const t = await this.sequelize.transaction();
    try {
      const row = await this.profileModel.create(
        {
          id: params.id,
          fullName: params.fullName,
          email: params.email,
          role: 'doctor',
          isActive: true,
          plan: params.plan,
          subscriptionStatus: 'trialing',
          specialty: params.specialty ?? null,
          // phone y cedula LLEGABAN hasta acá y se descartaban en silencio: el
          // formulario del portal los pide, el DTO los acepta y el use case los
          // pasa, pero este create() no los escribía. El vendedor cargaba el
          // teléfono y la ficha decía "No cargado".
          phone: params.phone ?? null,
          cedula: params.cedula ?? null,
          soldBy: params.soldBy,
          // The seller loaded this specialist by hand from their own portal. It is
          // seller-originated work, so it earns the signup commission — what does
          // NOT earn it is an admin assigning a lead ('admin'). Tagged separately
          // from 'code' so the payout detail can tell the two apart.
          soldBySource: 'seller_manual',
          sellerCode: null,
        } as Parameters<typeof SellerProfileModel.create>[0],
        { transaction: t },
      );

      // Create subscription row — mirrors the free_trial flow from createAdminDoctor.
      await this.sequelize.query(
        `INSERT INTO subscriptions
           (id, doctor_id, plan, status, price_usd, billing_cycle,
            current_period_start, current_period_end, trial_ends_at,
            cancelled_at, notes, created_at, updated_at)
         VALUES
           (uuid_generate_v4(), :doctorId, 'free_trial', 'trialing', 0, NULL,
            :now, :periodEnd, :periodEnd,
            NULL, NULL, now(), now())
         ON CONFLICT (doctor_id) DO NOTHING`,
        {
          replacements: { doctorId: params.id, now, periodEnd },
          transaction: t,
        },
      );

      await t.commit();
      return toSpecialistRow(row);
    } catch (err) {
      await t.rollback();
      if (err instanceof UniqueConstraintError) {
        const existing = await this.profileModel.findOne({
          where: { email: { [Op.iLike]: params.email } },
        });
        if (existing) throw new SpecialistEmailConflictError();
      }
      throw err;
    }
  }

  async linkSoldBy(specialistId: string, sellerId: string): Promise<void> {
    // UPDATE ... WHERE sold_by IS NULL: the DB guarantees the one-write rule even
    // under concurrent requests — only one of them can win the conditional update.
    //
    // sold_by_source travels WITH sold_by, in the same statement. This is the code
    // path, so it is always 'code'. Writing sold_by alone would leave the source
    // NULL, and AccrueSignupCommissionUseCase only pays when it reads 'code' —
    // the entry commission would silently never fire for anyone.
    await this.profileModel.update(
      { soldBy: sellerId, soldBySource: 'code' } as Partial<SellerProfileModel>,
      {
        where: { id: specialistId, soldBy: null },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSpecialistRow(row: SellerProfileModel): SellerSpecialistRow {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone ?? null,
    cedula: row.cedula ?? null,
    isActive: row.isActive ?? true,
    specialty: row.specialty ?? null,
    plan: row.plan ?? null,
    subscriptionStatus: row.subscriptionStatus ?? null,
    createdAt: row.createdAt,
    lastSignInAt: row.lastSignInAt ?? null,
    // Legacy rows that predate the column may return null; treat as false.
    onboardingCompleted: row.onboardingCompleted ?? false,
  };
}
