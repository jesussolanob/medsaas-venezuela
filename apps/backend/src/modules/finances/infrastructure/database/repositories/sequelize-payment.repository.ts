import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type {
  IPaymentRepository,
  PaymentListFilters,
  PaymentTotals,
  PaymentWithRelations,
  AddPaymentItemInput,
} from '../../../domain/repositories/payment.repository';
import { Payment, type PaymentStatus } from '../../../domain/entities/payment.entity';
import { PaymentItem } from '../../../domain/entities/payment-item.entity';
import { PaymentModel } from '../models/payment.model';
import { PaymentItemModel } from '../models/payment-item.model';
import { PaymentNotFoundError } from '../../../domain/errors/payment-not-found.error';
import { PaymentNotOwnedError } from '../../../domain/errors/payment-not-owned.error';
import { PaymentItemNotFoundError } from '../../../domain/errors/payment-item-not-found.error';

/** Raw row returned by the list query join. */
interface PaymentListRow {
  id: string;
  payment_code: string | null;
  amount_usd: string;
  amount_bs: string | null;
  status: string;
  paid_at: string | null;
  method_snapshot: string | null;
  created_at: string;
  appt_id: string | null;
  appointment_code: string | null;
  scheduled_at: string | null;
  patient_name: string | null;
  plan_name: string | null;
  payment_receipt_url: string | null;
  consultation_id: string | null;
  consultation_code: string | null;
}

/** Raw row returned by the totals aggregation query. */
interface TotalsRow {
  approved_usd: string | null;
  pending_usd: string | null;
  approved_count: string | null;
  pending_count: string | null;
}

/**
 * Sequelize implementation of IPaymentRepository.
 *
 * All writes that modify multiple tables (updateStatus, addItem, removeItem)
 * are wrapped in Sequelize transactions so partial failures are rolled back.
 *
 * SECURITY:
 *   - doctorId is always from the authenticated caller (anti-IDOR).
 *   - No PII from patients table is accessed here.
 *     patient_name is the snapshot already stored in appointments.patient_name.
 */
@Injectable()
export class SequelizePaymentRepository implements IPaymentRepository {
  constructor(
    @InjectModel(PaymentModel)
    private readonly paymentModel: typeof PaymentModel,
    @InjectModel(PaymentItemModel)
    private readonly itemModel: typeof PaymentItemModel,
    private readonly sequelize: Sequelize,
  ) {}

  async listForDoctor(filters: PaymentListFilters): Promise<PaymentWithRelations[]> {
    const conditions: string[] = ['p.doctor_id = :doctorId'];
    const replacements: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.status && filters.status !== 'all') {
      conditions.push('p.status = :status');
      replacements['status'] = filters.status;
    }
    if (filters.fromDate) {
      conditions.push('p.created_at >= :fromDate::timestamptz');
      replacements['fromDate'] = filters.fromDate;
    }
    if (filters.toDate) {
      conditions.push('p.created_at <= :toDate::timestamptz');
      replacements['toDate'] = filters.toDate;
    }

    const where = conditions.join(' AND ');

    const rows = await this.sequelize.query<PaymentListRow>(
      `SELECT
         p.id,
         p.payment_code,
         p.amount_usd,
         p.amount_bs,
         p.status,
         p.paid_at,
         p.method_snapshot,
         p.created_at,
         a.id            AS appt_id,
         a.appointment_code,
         a.scheduled_at,
         a.patient_name,
         a.plan_name,
         a.payment_receipt_url,
         a.consultation_id,
         c.consultation_code
       FROM payments p
       LEFT JOIN appointments a ON a.payment_id = p.id
       LEFT JOIN consultations c ON c.id = a.consultation_id
       WHERE ${where}
       ORDER BY p.created_at DESC`,
      { replacements, type: QueryTypes.SELECT },
    );

    return rows.map((r) => this.toRelationsDto(r));
  }

  async totalsForDoctor(filters: {
    doctorId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<PaymentTotals> {
    const conditions: string[] = ['doctor_id = :doctorId'];
    const replacements: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.fromDate) {
      conditions.push('created_at >= :fromDate::timestamptz');
      replacements['fromDate'] = filters.fromDate;
    }
    if (filters.toDate) {
      conditions.push('created_at <= :toDate::timestamptz');
      replacements['toDate'] = filters.toDate;
    }

    const where = conditions.join(' AND ');

    const rows = await this.sequelize.query<TotalsRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'approved' THEN amount_usd ELSE 0 END), 0) AS approved_usd,
         COALESCE(SUM(CASE WHEN status = 'pending'  THEN amount_usd ELSE 0 END), 0) AS pending_usd,
         COUNT(CASE WHEN status = 'approved' THEN 1 ELSE NULL END)::text             AS approved_count,
         COUNT(CASE WHEN status = 'pending'  THEN 1 ELSE NULL END)::text             AS pending_count
       FROM payments
       WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT },
    );

    const row = rows[0];
    return {
      approvedUsd: row ? parseFloat(row.approved_usd ?? '0') : 0,
      pendingUsd: row ? parseFloat(row.pending_usd ?? '0') : 0,
      approvedCount: row ? parseInt(row.approved_count ?? '0', 10) : 0,
      pendingCount: row ? parseInt(row.pending_count ?? '0', 10) : 0,
    };
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<Payment | null> {
    const row = await this.paymentModel.findOne({
      where: { id } as Record<string, unknown>,
    });
    if (!row) return null;
    const payment = this.toDomain(row);
    if (!payment.isOwnedBy(doctorId)) return null;
    return payment;
  }

  async updateStatus(id: string, doctorId: string, status: PaymentStatus): Promise<Payment> {
    return this.sequelize.transaction(async (t) => {
      const row = await this.paymentModel.findOne({
        where: { id } as Record<string, unknown>,
        lock: true,
        transaction: t,
      });

      if (!row) throw new PaymentNotFoundError(id);
      const payment = this.toDomain(row);
      if (!payment.isOwnedBy(doctorId)) throw new PaymentNotOwnedError();

      const updated = status === 'approved' ? payment.approve() : payment.markPending();

      await this.paymentModel.update(
        {
          status: updated.status,
          paidAt: updated.paidAt,
          updatedAt: new Date(),
        },
        { where: { id } as Record<string, unknown>, transaction: t },
      );

      // Sync consultations.payment_status via appointments.payment_id
      await this.sequelize.query(
        `UPDATE consultations c
           SET payment_status = :status,
               updated_at     = now()
           FROM appointments a
           WHERE a.payment_id         = :paymentId
             AND a.consultation_id    = c.id`,
        {
          replacements: { status, paymentId: id },
          type: QueryTypes.UPDATE,
          transaction: t,
        },
      );

      return updated;
    });
  }

  async addItem(input: AddPaymentItemInput): Promise<PaymentItem> {
    return this.sequelize.transaction(async (t) => {
      // Verify payment exists and belongs to doctor
      const paymentRow = await this.paymentModel.findOne({
        where: { id: input.paymentId } as Record<string, unknown>,
        lock: true,
        transaction: t,
      });
      if (!paymentRow) throw new PaymentNotFoundError(input.paymentId);
      const payment = this.toDomain(paymentRow);
      if (!payment.isOwnedBy(input.doctorId)) throw new PaymentNotOwnedError();

      // Insert the item
      const now = new Date();
      const itemRow = await this.itemModel.create(
        {
          id: input.id,
          paymentId: input.paymentId,
          doctorId: input.doctorId,
          name: input.name,
          amountUsd: input.amountUsd,
          sourceType: input.sourceType ?? null,
          sourceId: input.sourceId ?? null,
          createdAt: now,
          updatedAt: now,
        },
        { transaction: t },
      );

      // Recalculate payment total: existing total + new item amount
      const newTotal = Number(paymentRow.amountUsd) + input.amountUsd;
      await this.paymentModel.update(
        { amountUsd: newTotal, updatedAt: new Date() },
        { where: { id: input.paymentId } as Record<string, unknown>, transaction: t },
      );

      // Sync appointments.plan_price
      await this.sequelize.query(
        `UPDATE appointments
           SET plan_price = :newTotal,
               updated_at = now()
           WHERE payment_id = :paymentId`,
        {
          replacements: { newTotal, paymentId: input.paymentId },
          type: QueryTypes.UPDATE,
          transaction: t,
        },
      );

      return this.toItemDomain(itemRow);
    });
  }

  async removeItem(itemId: string, doctorId: string): Promise<void> {
    await this.sequelize.transaction(async (t) => {
      const itemRow = await this.itemModel.findOne({
        where: { id: itemId } as Record<string, unknown>,
        lock: true,
        transaction: t,
      });

      if (!itemRow) throw new PaymentItemNotFoundError(itemId);
      if (itemRow.doctorId !== doctorId) throw new PaymentNotOwnedError();

      const paymentId = itemRow.paymentId;
      const itemAmount = Number(itemRow.amountUsd);

      await this.itemModel.destroy({
        where: { id: itemId } as Record<string, unknown>,
        transaction: t,
      });

      // Recalculate payment total: existing total - removed item amount (floor at 0)
      const paymentRow = await this.paymentModel.findOne({
        where: { id: paymentId } as Record<string, unknown>,
        lock: true,
        transaction: t,
      });

      if (paymentRow) {
        const newTotal = Math.max(0, Number(paymentRow.amountUsd) - itemAmount);
        await this.paymentModel.update(
          { amountUsd: newTotal, updatedAt: new Date() },
          { where: { id: paymentId } as Record<string, unknown>, transaction: t },
        );

        // Sync appointments.plan_price
        await this.sequelize.query(
          `UPDATE appointments
             SET plan_price = :newTotal,
                 updated_at = now()
             WHERE payment_id = :paymentId`,
          {
            replacements: { newTotal, paymentId },
            type: QueryTypes.UPDATE,
            transaction: t,
          },
        );
      }
    });
  }

  async listItems(paymentId: string, doctorId: string): Promise<PaymentItem[]> {
    // Verify ownership before returning items
    const paymentRow = await this.paymentModel.findOne({
      where: { id: paymentId } as Record<string, unknown>,
    });
    if (!paymentRow) throw new PaymentNotFoundError(paymentId);
    const payment = this.toDomain(paymentRow);
    if (!payment.isOwnedBy(doctorId)) throw new PaymentNotOwnedError();

    const rows = await this.itemModel.findAll({
      where: { paymentId } as Record<string, unknown>,
      order: [['createdAt', 'ASC']],
    });

    return rows.map((r) => this.toItemDomain(r));
  }

  async attachReceiptUrl(
    paymentId: string,
    doctorId: string,
    receiptUrl: string,
  ): Promise<Payment> {
    const row = await this.paymentModel.findOne({
      where: { id: paymentId } as Record<string, unknown>,
    });

    if (!row) throw new PaymentNotFoundError(paymentId);
    const payment = this.toDomain(row);
    if (!payment.isOwnedBy(doctorId)) throw new PaymentNotOwnedError();

    await this.paymentModel.update(
      { paymentReceiptUrl: receiptUrl, updatedAt: new Date() },
      { where: { id: paymentId } as Record<string, unknown> },
    );

    // Return updated domain entity
    const updated = await this.paymentModel.findOne({
      where: { id: paymentId } as Record<string, unknown>,
    });
    if (!updated) throw new PaymentNotFoundError(paymentId);
    return this.toDomain(updated);
  }

  async create(params: {
    id: string;
    doctorId: string;
    patientId: string;
    amountUsd: number;
    amountBs?: number | null;
    bcvRate?: number | null;
    currency?: string;
    methodSnapshot?: string | null;
    paymentReference?: string | null;
    status?: PaymentStatus;
    packageId?: string | null;
    paymentCode?: string | null;
    transaction?: unknown;
  }): Promise<Payment> {
    const now = new Date();
    const row = await this.paymentModel.create(
      {
        id: params.id,
        doctorId: params.doctorId,
        patientId: params.patientId,
        amountUsd: params.amountUsd,
        amountBs: params.amountBs ?? null,
        bcvRate: params.bcvRate ?? null,
        currency: params.currency ?? 'USD',
        methodSnapshot: params.methodSnapshot ?? null,
        paymentReference: params.paymentReference ?? null,
        status: params.status ?? 'pending',
        packageId: params.packageId ?? null,
        paymentCode: params.paymentCode ?? null,
        paidAt: null,
        createdAt: now,
        updatedAt: now,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { transaction: params.transaction as any },
    );
    return this.toDomain(row);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: PaymentModel): Payment {
    return Payment.create({
      id: row.id,
      doctorId: row.doctorId,
      patientId: row.patientId,
      amountUsd: Number(row.amountUsd),
      amountBs: row.amountBs != null ? Number(row.amountBs) : null,
      bcvRate: row.bcvRate != null ? Number(row.bcvRate) : null,
      currency: row.currency,
      methodSnapshot: row.methodSnapshot,
      paymentReference: row.paymentReference,
      paymentReceiptUrl: row.paymentReceiptUrl,
      paymentCode: row.paymentCode,
      status: row.status as PaymentStatus,
      paidAt: row.paidAt,
      packageId: row.packageId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toItemDomain(row: PaymentItemModel): PaymentItem {
    return PaymentItem.create({
      id: row.id,
      paymentId: row.paymentId,
      doctorId: row.doctorId,
      name: row.name,
      amountUsd: Number(row.amountUsd),
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toRelationsDto(r: PaymentListRow): PaymentWithRelations {
    return {
      id: r.id,
      paymentCode: r.payment_code,
      amountUsd: parseFloat(r.amount_usd),
      amountBs: r.amount_bs != null ? parseFloat(r.amount_bs) : null,
      status: r.status as PaymentStatus,
      paidAt: r.paid_at ? new Date(r.paid_at) : null,
      methodSnapshot: r.method_snapshot,
      createdAt: new Date(r.created_at),
      appointment: r.appt_id
        ? {
            id: r.appt_id,
            appointmentCode: r.appointment_code,
            scheduledAt: new Date(r.scheduled_at!),
            patientName: r.patient_name,
            planName: r.plan_name,
            paymentReceiptUrl: r.payment_receipt_url,
            consultationId: r.consultation_id,
          }
        : null,
      consultation: r.consultation_code ? { consultationCode: r.consultation_code } : null,
    };
  }
}
