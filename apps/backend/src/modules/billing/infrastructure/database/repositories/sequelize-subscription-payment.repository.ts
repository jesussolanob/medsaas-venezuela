import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type {
  ISubscriptionPaymentRepository,
  CreateSubscriptionPaymentParams,
  ApproveSubscriptionPaymentParams,
  SaveApprovedAndExtendParams,
  SubscriptionPaymentListFilters,
  SubscriptionPaymentListResult,
  FinanceStats,
  MonthBucket,
  RecentApprovedRow,
  PendingPaymentRow,
} from '../../../domain/repositories/subscription-payment.repository';
import {
  SubscriptionPayment,
  type SubscriptionPaymentStatus,
} from '../../../domain/entities/subscription-payment.entity';
import { SubscriptionPaymentModel } from '../models/subscription-payment.model';
import { SubscriptionChangeLogModel } from '../models/subscription-change-log.model';
import { ProfileAdminModel } from '../../../../admin/infrastructure/database/models/profile.model';
import { AdminSubscriptionModel } from '../../../../admin/infrastructure/database/models/subscription.model';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';

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
        // 3. Ensure subscription row exists, then extend current_period_end.
        // findOrCreate guards against legacy doctors whose subscription row was
        // never created (no-op for doctors already having one, since doctor_id is UNIQUE).
        const [, subCreated] = await this.subscriptionModel.findOrCreate({
          where: { doctorId },
          defaults: {
            doctorId,
            plan: 'delta_free' as SubscriptionPlan,
            status: 'active' as SubscriptionStatus,
            priceUsd: 0,
            currentPeriodStart: now,
            currentPeriodEnd: params.newExpiresAt,
          },
          transaction: t,
        });

        if (!subCreated) {
          await this.subscriptionModel.update(
            {
              status: 'active',
              currentPeriodEnd: params.newExpiresAt,
              updatedAt: now,
            },
            { where: { doctorId }, transaction: t },
          );
        }

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

  async saveApprovedAndExtend(params: SaveApprovedAndExtendParams): Promise<SubscriptionPayment> {
    const t = await this.sequelize.transaction();

    try {
      const now = params.reviewedAt;

      // 1. INSERT payment with status='approved' directly.
      const created = await this.model.create(
        {
          id: params.id,
          doctorId: params.doctorId,
          amountUsd: params.amountUsd,
          method: params.method,
          referenceNumber: params.referenceNumber,
          durationMonths: params.durationMonths,
          status: 'approved' as SubscriptionPaymentStatus,
          reviewedBy: params.reviewerId,
          reviewedAt: now,
        },
        { transaction: t },
      );

      // 2. Ensure subscription row exists, then extend current_period_end.
      const [, subCreated] = await this.subscriptionModel.findOrCreate({
        where: { doctorId: params.doctorId },
        defaults: {
          doctorId: params.doctorId,
          plan: 'delta_free' as SubscriptionPlan,
          status: 'active' as SubscriptionStatus,
          priceUsd: 0,
          currentPeriodStart: now,
          currentPeriodEnd: params.newExpiresAt,
        },
        transaction: t,
      });

      if (!subCreated) {
        await this.subscriptionModel.update(
          {
            status: 'active',
            currentPeriodEnd: params.newExpiresAt,
            updatedAt: now,
          },
          { where: { doctorId: params.doctorId }, transaction: t },
        );
      }

      // 3. Sync profiles snapshot.
      await this.profileModel.update(
        {
          subscriptionStatus: 'active',
          subscriptionExpiresAt: params.newExpiresAt,
          updatedAt: now,
        },
        { where: { id: params.doctorId }, transaction: t },
      );

      // 4. INSERT subscription_changes_log.
      await this.logModel.create(
        {
          id: randomUUID(),
          doctorId: params.doctorId,
          action: 'payment_approved',
          actorId: params.reviewerId,
          actorRole: 'super_admin',
          reason: null,
          subscriptionExpiresAt: params.newExpiresAt,
          metadata: {
            amount_usd: params.amountUsd,
            method: params.method,
            reference: params.referenceNumber,
            months_added: params.durationMonths,
            manual_registration: true,
          },
        },
        { transaction: t },
      );

      await t.commit();
      return this.rowToDomain(created);
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
  // Finance stats aggregate (admin — doctor PII only, no patient PII)
  // ---------------------------------------------------------------------------

  async getFinanceStats(): Promise<FinanceStats> {
    const now = new Date();
    const mtdStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevMonthEnd = mtdStart;

    // --- MTD revenue and previous month MTD revenue ---
    interface RevenueRow {
      mtd: string | null;
      prev_mtd: string | null;
      pending_total: string | null;
      pending_count: string;
      total_approved: string;
    }

    const [revenue] = await this.sequelize.query<RevenueRow>(
      `SELECT
         (SELECT COALESCE(SUM(amount_usd), 0)
            FROM subscription_payments
           WHERE status = 'approved'
             AND reviewed_at >= :mtdStart
             AND reviewed_at < :now)                       AS mtd,

         (SELECT COALESCE(SUM(amount_usd), 0)
            FROM subscription_payments
           WHERE status = 'approved'
             AND reviewed_at >= :prevMonthStart
             AND reviewed_at < :prevMonthEnd)              AS prev_mtd,

         (SELECT COALESCE(SUM(amount_usd), 0)
            FROM subscription_payments
           WHERE status = 'pending')                       AS pending_total,

         (SELECT COUNT(*)
            FROM subscription_payments
           WHERE status = 'pending')::text                  AS pending_count,

         (SELECT COUNT(*)
            FROM subscription_payments
           WHERE status = 'approved')::text                 AS total_approved`,
      {
        type: QueryTypes.SELECT,
        replacements: { mtdStart, now, prevMonthStart, prevMonthEnd },
      },
    );

    const mtdRevenue = parseFloat(revenue?.mtd ?? '0') || 0;
    const prevMtdRevenue = parseFloat(revenue?.prev_mtd ?? '0') || 0;
    const pendingTotal = parseFloat(revenue?.pending_total ?? '0') || 0;
    const pendingCount = parseInt(revenue?.pending_count ?? '0', 10);
    const totalApproved = parseInt(revenue?.total_approved ?? '0', 10);

    let momChange: number;
    if (prevMtdRevenue > 0) {
      momChange = Math.round(((mtdRevenue - prevMtdRevenue) / prevMtdRevenue) * 100);
    } else {
      momChange = mtdRevenue > 0 ? 100 : 0;
    }

    // --- Month buckets (last 6 months, approved payments) ---
    const SPANISH_MONTHS = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    interface BucketRow {
      year_month: string;
      total: string;
    }

    const bucketRows = await this.sequelize.query<BucketRow>(
      `SELECT
         TO_CHAR(reviewed_at, 'YYYY-MM') AS year_month,
         COALESCE(SUM(amount_usd), 0)::text AS total
       FROM subscription_payments
       WHERE status = 'approved'
         AND reviewed_at >= :since
       GROUP BY TO_CHAR(reviewed_at, 'YYYY-MM')
       ORDER BY year_month ASC`,
      {
        type: QueryTypes.SELECT,
        replacements: { since: sixMonthsAgo },
      },
    );

    const bucketMap = new Map<string, number>(
      bucketRows.map((r) => [r.year_month, parseFloat(r.total) || 0]),
    );

    // Build complete 6-month range (fill missing months with 0)
    const monthBuckets: MonthBucket[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = SPANISH_MONTHS[d.getUTCMonth()] ?? key;
      monthBuckets.push({ label, total: bucketMap.get(key) ?? 0 });
    }

    // --- Recent approved (top 20) with doctor name ---
    interface RecentApprovedDbRow {
      id: string;
      doctor_name: string;
      amount_usd: string;
      method: string;
      reviewed_at: Date;
    }

    const recentRows = await this.sequelize.query<RecentApprovedDbRow>(
      `SELECT sp.id, COALESCE(p.full_name, '') AS doctor_name,
              sp.amount_usd, sp.method, sp.reviewed_at
         FROM subscription_payments sp
         LEFT JOIN profiles p ON p.id = sp.doctor_id
        WHERE sp.status = 'approved'
        ORDER BY sp.reviewed_at DESC
        LIMIT 20`,
      { type: QueryTypes.SELECT },
    );

    const recentApproved: RecentApprovedRow[] = recentRows.map((r) => ({
      id: r.id,
      doctorName: r.doctor_name,
      amountUsd: parseFloat(r.amount_usd) || 0,
      method: r.method,
      reviewedAt: r.reviewed_at,
    }));

    // --- Pending payments (top 4) with doctor name + specialty ---
    interface PendingDbRow {
      id: string;
      doctor_name: string;
      specialty: string | null;
      amount_usd: string;
      method: string;
      created_at: Date;
    }

    const pendingRows = await this.sequelize.query<PendingDbRow>(
      `SELECT sp.id, COALESCE(p.full_name, '') AS doctor_name,
              p.specialty, sp.amount_usd, sp.method, sp.created_at
         FROM subscription_payments sp
         LEFT JOIN profiles p ON p.id = sp.doctor_id
        WHERE sp.status = 'pending'
        ORDER BY sp.created_at DESC
        LIMIT 4`,
      { type: QueryTypes.SELECT },
    );

    const pendingPayments: PendingPaymentRow[] = pendingRows.map((r) => ({
      id: r.id,
      doctorName: r.doctor_name,
      specialty: r.specialty ?? null,
      amountUsd: parseFloat(r.amount_usd) || 0,
      method: r.method,
      createdAt: r.created_at,
    }));

    return {
      mtdRevenue,
      prevMtdRevenue,
      momChange,
      pendingTotal,
      pendingCount,
      totalApproved,
      monthBuckets,
      recentApproved,
      pendingPayments,
    };
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
