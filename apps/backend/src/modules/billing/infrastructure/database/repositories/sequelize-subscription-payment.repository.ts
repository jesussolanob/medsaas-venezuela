import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import type {
  ISubscriptionPaymentRepository,
  CreateSubscriptionPaymentParams,
  ApproveSubscriptionPaymentParams,
  SubscriptionPaymentListFilters,
  SubscriptionPaymentListResult,
} from '../../../domain/repositories/subscription-payment.repository';
import {
  SubscriptionPayment,
  type SubscriptionPaymentStatus,
} from '../../../domain/entities/subscription-payment.entity';
import { SubscriptionPaymentModel } from '../models/subscription-payment.model';
import { SubscriptionChangeLogModel } from '../models/subscription-change-log.model';
import { ProfileAdminModel } from '../../../../admin/infrastructure/database/models/profile.model';
import { AdminSubscriptionModel } from '../../../../admin/infrastructure/database/models/subscription.model';

/**
 * Sequelize implementation of ISubscriptionPaymentRepository.
 *
 * The approveAndExtend method executes atomically using a managed transaction:
 *   1. Mark payment approved
 *   2. Extend subscriptions.current_period_end
 *   3. Sync profiles snapshot
 *   4. Insert subscription_changes_log
 */
@Injectable()
export class SequelizeSubscriptionPaymentRepository implements ISubscriptionPaymentRepository {
  constructor(
    @InjectModel(SubscriptionPaymentModel)
    private readonly model: typeof SubscriptionPaymentModel,
    @InjectModel(SubscriptionChangeLogModel)
    private readonly logModel: typeof SubscriptionChangeLogModel,
    @InjectModel(ProfileAdminModel)
    private readonly profileModel: typeof ProfileAdminModel,
    @InjectModel(AdminSubscriptionModel)
    private readonly subscriptionModel: typeof AdminSubscriptionModel,
    private readonly sequelize: Sequelize,
  ) {}

  async list(filters: SubscriptionPaymentListFilters): Promise<SubscriptionPaymentListResult> {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;

    const offset = (filters.page - 1) * filters.limit;

    const { count, rows } = await this.model.findAndCountAll({
      where,
      limit: filters.limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      items: rows.map((r) => this.rowToDomain(r)),
      total: typeof count === 'number' ? count : 0,
      page: filters.page,
      limit: filters.limit,
    };
  }

  async findById(id: string): Promise<SubscriptionPayment | null> {
    const row = await this.model.findByPk(id);
    return row ? this.rowToDomain(row) : null;
  }

  async save(params: CreateSubscriptionPaymentParams): Promise<SubscriptionPayment> {
    const row = await this.model.create({
      id: params.id,
      doctorId: params.doctorId,
      amountUsd: params.amountUsd,
      method: params.method,
      referenceNumber: params.referenceNumber,
      durationMonths: params.durationMonths,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
    });
    return this.rowToDomain(row);
  }

  async approveAndExtend(
    params: ApproveSubscriptionPaymentParams,
    meta: {
      amountUsd: number;
      method: string;
      referenceNumber: string | null;
      monthsAdded: number;
      actorRole: string;
    },
  ): Promise<void> {
    const t = await this.sequelize.transaction();

    try {
      const now = new Date();

      // 1. Mark payment approved
      await this.model.update(
        {
          status: 'approved' as SubscriptionPaymentStatus,
          reviewedBy: params.reviewerId,
          reviewedAt: now,
          updatedAt: now,
        },
        { where: { id: params.paymentId }, transaction: t },
      );

      // 2. Look up doctorId from payment for subscription + profile updates
      const payment = await this.model.findByPk(params.paymentId, { transaction: t });
      const doctorId = payment?.doctorId;

      if (doctorId) {
        // 3. Extend subscriptions.current_period_end
        await this.subscriptionModel.update(
          {
            status: 'active',
            currentPeriodEnd: params.newExpiresAt,
            updatedAt: now,
          },
          { where: { doctorId }, transaction: t },
        );

        // 4. Sync profiles snapshot
        await this.profileModel.update(
          {
            subscriptionStatus: 'active',
            subscriptionExpiresAt: params.newExpiresAt,
            updatedAt: now,
          },
          { where: { id: doctorId }, transaction: t },
        );

        // 5. Insert subscription_changes_log
        await this.logModel.create(
          {
            id: randomUUID(),
            doctorId,
            action: 'payment_approved',
            actorId: params.reviewerId,
            actorRole: meta.actorRole,
            reason: null,
            subscriptionExpiresAt: params.newExpiresAt,
            metadata: {
              amount_usd: meta.amountUsd,
              method: meta.method,
              reference: meta.referenceNumber,
              months_added: meta.monthsAdded,
            },
          },
          { transaction: t },
        );
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async reject(paymentId: string, reviewerId: string, reason?: string): Promise<void> {
    const now = new Date();

    // Use a transaction so we can also log the rejection
    const t = await this.sequelize.transaction();
    try {
      await this.model.update(
        {
          status: 'rejected' as SubscriptionPaymentStatus,
          reviewedBy: reviewerId,
          reviewedAt: now,
          updatedAt: now,
        },
        { where: { id: paymentId }, transaction: t },
      );

      const payment = await this.model.findByPk(paymentId, { transaction: t });
      if (payment) {
        await this.logModel.create(
          {
            id: randomUUID(),
            doctorId: payment.doctorId,
            action: 'payment_rejected',
            actorId: reviewerId,
            actorRole: 'super_admin',
            reason: reason ?? null,
            subscriptionExpiresAt: null,
            metadata: {
              payment_id: paymentId,
            },
          },
          { transaction: t },
        );
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private rowToDomain(row: SubscriptionPaymentModel): SubscriptionPayment {
    return SubscriptionPayment.create({
      id: row.id,
      doctorId: row.doctorId,
      amountUsd: Number(row.amountUsd),
      method: row.method,
      referenceNumber: row.referenceNumber,
      durationMonths: row.durationMonths,
      status: row.status,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
