import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import type { WhereOptions } from 'sequelize';
import {
  ConsultationPayment,
  type PaymentStatus,
} from '../../../domain/entities/consultation-payment.entity';
import type {
  IConsultationPaymentRepository,
  ConsultationPaymentListFilters,
  ConsultationPaymentListResult,
} from '../../../domain/repositories/consultation-payment.repository';
import { ConsultationPaymentModel } from '../models/consultation-payment.model';
import { ConsultationModel } from '../../../../consultations/infrastructure/database/models/consultation.model';

/**
 * Sequelize implementation of IConsultationPaymentRepository.
 *
 * Transactions:
 *   - create() wraps the INSERT into consultation_payments + UPDATE of
 *     consultations.payment_status inside a single transaction to keep both
 *     tables consistent (no PHI in payment rows; no PHI sync needed).
 *   - save() wraps the UPDATE of consultation_payments in a transaction and
 *     re-reads the row atomically.
 *
 * Anti-IDOR: every query that can return data is scoped by doctorId in the
 * WHERE clause. The domain entity also enforces isOwnedBy() as defense-in-depth.
 *
 * No encryption: payment financial fields are not PHI per CLAUDE.md policy.
 */
@Injectable()
export class SequelizeConsultationPaymentRepository implements IConsultationPaymentRepository {
  constructor(
    @InjectModel(ConsultationPaymentModel)
    private readonly paymentModel: typeof ConsultationPaymentModel,
    @InjectModel(ConsultationModel)
    private readonly consultationModel: typeof ConsultationModel,
    private readonly sequelize: Sequelize,
  ) {}

  async list(filters: ConsultationPaymentListFilters): Promise<ConsultationPaymentListResult> {
    const where: Record<string, unknown> = { doctorId: filters.doctorId };

    if (filters.consultationId) {
      where.consultationId = filters.consultationId;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    const { count, rows } = await this.paymentModel.findAndCountAll({
      where: where as WhereOptions,
      limit: filters.limit,
      offset: filters.offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      items: rows.map((r) => this.toDomain(r)),
      total: count as number,
    };
  }

  async findByIdForDoctor(id: string, doctorId: string): Promise<ConsultationPayment | null> {
    const row = await this.paymentModel.findOne({
      where: { id, doctorId } as WhereOptions,
    });
    if (!row) return null;
    return this.toDomain(row);
  }

  /**
   * Persists a new payment and synchronizes consultations.payment_status = 'pending'
   * and consultations.amount inside the same transaction.
   *
   * Both operations must succeed atomically — a partial write (payment created but
   * consultation not updated, or vice versa) would leave the data inconsistent.
   */
  async create(payment: ConsultationPayment): Promise<ConsultationPayment> {
    return this.sequelize.transaction(async (t) => {
      const row = await this.paymentModel.create(
        {
          id: payment.id,
          consultationId: payment.consultationId,
          doctorId: payment.doctorId,
          patientId: payment.patientId,
          amount: payment.amount,
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
          referenceNumber: payment.referenceNumber,
          receiptUrl: payment.receiptUrl,
          notes: payment.notes,
          status: payment.status,
          approvedAt: payment.approvedAt,
          approvedBy: payment.approvedBy,
        },
        { transaction: t },
      );

      // Sync consultation payment_status and amount to reflect pending payment.
      // Scoped by (id, doctorId) for anti-IDOR at the DB level.
      await this.consultationModel.update(
        { paymentStatus: 'pending', amount: payment.amount },
        {
          where: { id: payment.consultationId, doctorId: payment.doctorId } as WhereOptions,
          transaction: t,
        },
      );

      return this.toDomain(row);
    });
  }

  /**
   * Persists a status transition (approve / reject).
   *
   * Wraps the UPDATE + re-read in a transaction so the returned entity reflects
   * exactly what was written, even under concurrent requests.
   *
   * When approving, also syncs consultations.payment_status = 'approved'.
   */
  async save(payment: ConsultationPayment): Promise<ConsultationPayment> {
    return this.sequelize.transaction(async (t) => {
      await this.paymentModel.update(
        {
          status: payment.status,
          approvedAt: payment.approvedAt,
          approvedBy: payment.approvedBy,
          notes: payment.notes,
          updatedAt: payment.updatedAt,
        },
        {
          where: { id: payment.id, doctorId: payment.doctorId } as WhereOptions,
          transaction: t,
        },
      );

      // Sync consultation.payment_status when approving.
      if (payment.status === 'approved') {
        await this.consultationModel.update(
          { paymentStatus: 'approved' },
          {
            where: {
              id: payment.consultationId,
              doctorId: payment.doctorId,
            } as WhereOptions,
            transaction: t,
          },
        );
      }

      const updated = await this.paymentModel.findOne({
        where: { id: payment.id, doctorId: payment.doctorId } as WhereOptions,
        transaction: t,
      });

      // This should never happen since we just updated the row.
      // Return the in-memory entity if the re-read fails for any reason.
      if (!updated) return payment;

      return this.toDomain(updated);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDomain(row: ConsultationPaymentModel): ConsultationPayment {
    return ConsultationPayment.create({
      id: row.id,
      consultationId: row.consultationId,
      doctorId: row.doctorId,
      patientId: row.patientId,
      amount: Number(row.amount),
      currency: row.currency,
      paymentMethod: row.paymentMethod,
      referenceNumber: row.referenceNumber,
      receiptUrl: row.receiptUrl,
      notes: row.notes,
      status: row.status as PaymentStatus,
      approvedAt: row.approvedAt,
      approvedBy: row.approvedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
