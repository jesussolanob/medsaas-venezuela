import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, UniqueConstraintError, type Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { PlanPriceUpsertError } from '../../../domain/errors/plan-price-upsert.error';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import { DoctorEmailConflictError } from '../../../domain/errors/doctor-email-conflict.error';
import type {
  IAdminRepository,
  AdminDashboardData,
  DoctorListFilters,
  DoctorListResult,
  DoctorDetail,
  DoctorGrowthData,
  DoctorGrowthPoint,
  SubscriptionListFilters,
  SubscriptionListResult,
  SubscriptionRow,
  UpdateSubscriptionParams,
  SubscriptionSnapshot,
  ManualSubscriptionChangeParams,
  PlanFeatureRow,
  AppSetting,
  PatientStats,
  AdminUserRow,
  UpdatePlanParams,
  CreatePlanParams,
  PlanPriceRow,
  SetPlanPriceParams,
  PlanDetail,
  DashboardOverview,
  RecentDoctorRow,
  DoctorExportRow,
  PublicStats,
  CreateAdminDoctorParams,
  AdminCreatedDoctorResult,
  DoctorPatientRow,
} from '../../../domain/repositories/admin.repository';
import type { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanConfig as PlanConfigVO } from '../../../domain/value-objects/plan-config.vo';
import { DoctorWithActivity } from '../../../domain/entities/doctor-with-activity.entity';
import { ProfileAdminModel } from '../models/profile.model';
import { AdminSubscriptionModel } from '../models/subscription.model';
import { PlanConfigModel } from '../models/plan-config.model';
import { PlanFeatureModel } from '../models/plan-feature.model';
import { PlanPriceModel } from '../models/plan-price.model';
import { AccessAuditLogModel } from '../../../../patients/infrastructure/database/models/access-audit-log.model';
import { CryptoService } from '../../../../../infrastructure/crypto/crypto.service';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';

// Sensitive keys that must never be returned from the settings endpoint
const HIDDEN_SETTING_KEYS = new Set(['encryption_key', 'jwt_secret', 'usdt_rate_raw']);

/**
 * Trial duration in days — matches the value in sequelize-identity.repository.ts.
 * A new doctor created by admin with plan=free_trial gets 30 days from creation.
 */
const ADMIN_TRIAL_DURATION_DAYS = 30;

/**
 * Years to add for a "permanent" plan (delta_free).
 * Large enough to be effectively permanent; avoids actual null in the column.
 */
const PERMANENT_PLAN_YEARS = 99;

/**
 * Resolves the subscription status and period_end date for a given plan.
 *
 * Used by createAdminDoctor to mirror the registration flow logic without
 * duplicating the raw SQL / model imports from the auth module.
 *
 *   free_trial → trialing,  now + 30 days
 *   delta_free → active,    now + 99 years (permanent)
 *   delta_base → active,    now + 30 days (manual payment assumed; admin can extend later)
 *   delta_plus → active,    now + 30 days (same — admin-provisioned, manual payment)
 *   (fallback) → trialing,  now + 30 days
 */
function resolveSubscriptionTerms(
  plan: import('@delta/shared-types').SubscriptionPlan,
  now: Date,
): { status: import('@delta/shared-types').SubscriptionStatus; periodEnd: Date } {
  if (plan === 'delta_free') {
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + PERMANENT_PLAN_YEARS);
    return { status: 'active', periodEnd };
  }

  if (plan === 'delta_base' || plan === 'delta_plus') {
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + ADMIN_TRIAL_DURATION_DAYS);
    return { status: 'active', periodEnd };
  }

  // Default: free_trial and any other plan → trialing + 30-day period
  const periodEnd = new Date(now);
  periodEnd.setDate(periodEnd.getDate() + ADMIN_TRIAL_DURATION_DAYS);
  return { status: 'trialing', periodEnd };
}

// Raw query row shapes
interface CountRow {
  count: string;
}

interface PatientCountRow {
  doctor_id: string;
  count: string;
}

interface MonthlyGrowthRow {
  month: string;
  count: string;
}

interface DoctorStatsRow {
  patient_count: string;
  consultation_count: string;
  monthly_revenue: string | null;
}

/**
 * Sequelize implementation of IAdminRepository.
 *
 * All dashboard aggregations use raw SQL for efficiency — joining profiles,
 * subscriptions, appointments, and patients in a single pass avoids N+1 queries.
 *
 * last_sign_in_at is not tracked in Etapa 1 (requires Auth0 — Fase 4). The
 * DoctorWithActivity entity receives null and classifies all doctors as 'inactive'
 * until real login tracking is in place.
 */
@Injectable()
export class SequelizeAdminRepository implements IAdminRepository {
  constructor(
    @InjectModel(ProfileAdminModel)
    private readonly profileModel: typeof ProfileAdminModel,
    @InjectModel(AdminSubscriptionModel)
    private readonly subscriptionModel: typeof AdminSubscriptionModel,
    @InjectModel(PlanConfigModel)
    private readonly planConfigModel: typeof PlanConfigModel,
    @InjectModel(PlanFeatureModel)
    private readonly planFeatureModel: typeof PlanFeatureModel,
    @InjectModel(PlanPriceModel)
    private readonly planPriceModel: typeof PlanPriceModel,
    @InjectModel(AccessAuditLogModel)
    private readonly auditLogModel: typeof AccessAuditLogModel,
    private readonly sequelize: Sequelize,
    private readonly crypto: CryptoService,
  ) {}

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  async getDashboardData(): Promise<AdminDashboardData> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    interface DashboardAggRow {
      total_doctors: string;
      active_doctors: string;
      cold_doctors: string;
      inactive_doctors: string;
      appts_last_30d: string;
      total_patients: string;
      expiring_subs: string;
    }

    // Single round-trip: all KPIs in one query using CASE-based bucketing on last_sign_in_at.
    // Buckets:
    //   active   = last_sign_in_at >= now-7d
    //   cold     = now-30d <= last_sign_in_at < now-7d
    //   inactive = last_sign_in_at < now-30d OR IS NULL
    const [agg] = await this.sequelize.query<DashboardAggRow>(
      `SELECT
         COUNT(*)                                                                        AS total_doctors,
         COUNT(*) FILTER (WHERE last_sign_in_at >= :sevenDaysAgo)                       AS active_doctors,
         COUNT(*) FILTER (WHERE last_sign_in_at >= :thirtyDaysAgo
                            AND last_sign_in_at <  :sevenDaysAgo)                       AS cold_doctors,
         COUNT(*) FILTER (WHERE last_sign_in_at <  :thirtyDaysAgo
                            OR  last_sign_in_at IS NULL)                                AS inactive_doctors,
         (SELECT COUNT(*) FROM appointments WHERE created_at >= :thirtyDaysAgo)         AS appts_last_30d,
         (SELECT COUNT(*) FROM patients)                                                AS total_patients,
         (SELECT COUNT(*) FROM subscriptions
           WHERE status IN ('active', 'trial')
             AND current_period_end BETWEEN NOW() AND :deadline)                        AS expiring_subs
       FROM profiles
       WHERE role = 'doctor'`,
      {
        type: QueryTypes.SELECT,
        replacements: { sevenDaysAgo, thirtyDaysAgo, deadline: sevenDaysFromNow },
      },
    );

    return {
      totalDoctors: parseInt(agg?.total_doctors ?? '0', 10),
      activeDoctors: parseInt(agg?.active_doctors ?? '0', 10),
      coldDoctors: parseInt(agg?.cold_doctors ?? '0', 10),
      inactiveDoctors: parseInt(agg?.inactive_doctors ?? '0', 10),
      appointmentsLast30Days: parseInt(agg?.appts_last_30d ?? '0', 10),
      totalPatients: parseInt(agg?.total_patients ?? '0', 10),
      expiringSubscriptionsCount: parseInt(agg?.expiring_subs ?? '0', 10),
    };
  }

  // ---------------------------------------------------------------------------
  // Doctors
  // ---------------------------------------------------------------------------

  async listDoctors(filters: DoctorListFilters): Promise<DoctorListResult> {
    const { page, limit, subscriptionStatus } = filters;
    const offset = (page - 1) * limit;

    const baseWhere: Record<string, unknown> = { role: 'doctor' };

    // Filter by subscription_status snapshot on profiles (written by auth/register flow)
    if (subscriptionStatus) {
      baseWhere.subscriptionStatus = subscriptionStatus;
    }

    const { count, rows } = await this.profileModel.findAndCountAll({
      where: baseWhere,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    // Enrich each profile row with live subscription data via a secondary query
    const doctorIds = rows.map((r) => r.id);
    const subscriptions =
      doctorIds.length > 0
        ? await this.subscriptionModel.findAll({ where: { doctorId: doctorIds } })
        : [];
    const subByDoctorId = new Map(subscriptions.map((s) => [s.doctorId, s]));

    const items = rows.map((row) => this.profileRowToDomainWithSub(row, subByDoctorId.get(row.id)));

    // Activity filtering is in-memory because there is no lastSignInAt column in
    // Etapa 1 (requires Auth0 — Fase 4). When activityStatus is specified, the
    // `total` field reflects only the items matched on the current page, not a
    // full cross-page count. Pagination with activityStatus is therefore approximate
    // in Etapa 1. In Fase 4 this should be pushed down to the DB query.
    if (filters.activityStatus !== undefined) {
      const filteredItems = items.filter((d) => d.activityStatus === filters.activityStatus);
      return {
        items: filteredItems,
        total: filteredItems.length,
        page,
        limit,
      };
    }

    return {
      items,
      total: typeof count === 'number' ? count : 0,
      page,
      limit,
    };
  }

  async findDoctorById(doctorId: string): Promise<DoctorWithActivity | null> {
    const row = await this.profileModel.findOne({
      where: { id: doctorId, role: 'doctor' },
    });

    if (!row) return null;

    const sub = await this.subscriptionModel.findOne({ where: { doctorId } });
    return this.profileRowToDomainWithSub(row, sub ?? undefined);
  }

  async findDoctorDetail(doctorId: string): Promise<DoctorDetail | null> {
    const row = await this.profileModel.findOne({
      where: { id: doctorId, role: 'doctor' },
    });

    if (!row) return null;

    const sub = await this.subscriptionModel.findOne({ where: { doctorId } });

    // Compute current-month boundaries for stats queries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [statsRows] = await this.sequelize.query<DoctorStatsRow>(
      `SELECT
         (SELECT COUNT(*) FROM patients WHERE doctor_id = :doctorId AND deleted_at IS NULL) AS patient_count,
         (SELECT COUNT(*) FROM consultations
           WHERE doctor_id = :doctorId
             AND consultation_date >= :monthStart
             AND consultation_date < :monthEnd) AS consultation_count,
         (SELECT COALESCE(SUM(amount), 0) FROM consultations
           WHERE doctor_id = :doctorId
             AND payment_status = 'approved'
             AND consultation_date >= :monthStart
             AND consultation_date < :monthEnd) AS monthly_revenue`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId, monthStart, monthEnd },
      },
    );

    const stats = statsRows ?? {
      patient_count: '0',
      consultation_count: '0',
      monthly_revenue: '0',
    };

    const base = this.profileRowToDomainWithSub(row, sub ?? undefined);

    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      specialty: row.specialty,
      phone: row.phone ?? null,
      cedula: row.cedula ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      isActive: row.isActive ?? null,
      createdAt: row.createdAt,
      subscriptionStatus: base.subscriptionStatus,
      subscriptionPlan: base.subscriptionPlan,
      subscriptionExpiresAt: base.subscriptionExpiresAt,
      activityStatus: base.activityStatus,
      lastSignInAt: base.lastSignInAt,
      patientCount: parseInt(stats.patient_count ?? '0', 10),
      consultationCount: parseInt(stats.consultation_count ?? '0', 10),
      monthlyRevenue: parseFloat(stats.monthly_revenue ?? '0') || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Growth analytics
  // ---------------------------------------------------------------------------

  async getDoctorGrowth(): Promise<DoctorGrowthData> {
    // Generate the last 6 calendar months (current + 5 previous), oldest first
    const months: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${d.getFullYear()}-${mm}`);
    }

    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    // Count new doctor registrations grouped by calendar month
    const rows = await this.sequelize.query<MonthlyGrowthRow>(
      `SELECT
         TO_CHAR(created_at, 'YYYY-MM') AS month,
         COUNT(*)::text AS count
       FROM profiles
       WHERE role = 'doctor'
         AND created_at >= :since
       GROUP BY TO_CHAR(created_at, 'YYYY-MM')
       ORDER BY month ASC`,
      {
        type: QueryTypes.SELECT,
        replacements: { since: sixMonthsAgo },
      },
    );

    const countByMonth = new Map<string, number>(rows.map((r) => [r.month, parseInt(r.count, 10)]));

    // Build the chart data filling in 0 for months with no registrations
    const chartData: DoctorGrowthPoint[] = months.map((m) => ({
      month: m,
      count: countByMonth.get(m) ?? 0,
    }));

    const currentMonth = months[months.length - 1] ?? '';
    const previousMonth = months[months.length - 2] ?? '';

    const newThisMonth = countByMonth.get(currentMonth) ?? 0;
    const prevCount = countByMonth.get(previousMonth) ?? 0;

    // Avoid division by zero: if previous month is 0 → momGrowth = 0
    const momGrowth =
      prevCount === 0 ? 0 : Math.round(((newThisMonth - prevCount) / prevCount) * 100);

    return { chartData, newThisMonth, momGrowth };
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  async listSubscriptions(filters: SubscriptionListFilters): Promise<SubscriptionListResult> {
    const { page, limit, status, plan } = filters;
    const offset = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;

    const { count, rows } = await this.subscriptionModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    // Enrich with doctor profile data via secondary lookup
    const doctorIds = rows.map((r) => r.doctorId);
    const profiles =
      doctorIds.length > 0 ? await this.profileModel.findAll({ where: { id: doctorIds } }) : [];
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const items: SubscriptionRow[] = rows.map((row) => {
      const profile = profileById.get(row.doctorId);
      return {
        id: row.id,
        doctorId: row.doctorId,
        doctorName: profile?.fullName ?? '',
        doctorEmail: profile?.email ?? '',
        plan: row.plan,
        status: row.status,
        priceUsd: Number(row.priceUsd),
        currentPeriodEnd: row.currentPeriodEnd,
        trialEndsAt: row.trialEndsAt ?? null,
        createdAt: row.createdAt,
      };
    });

    return {
      items,
      total: typeof count === 'number' ? count : 0,
      page,
      limit,
    };
  }

  async updateDoctorSubscription(params: UpdateSubscriptionParams): Promise<void> {
    const now = new Date();

    // findOrCreate ensures the subscriptions row always exists before updating.
    // doctor_id is UNIQUE, so the INSERT half of findOrCreate is a no-op if the
    // row is already present. If the row was missing (legacy doctor), it is
    // created with the requested values and no second UPDATE is needed.
    const [, created] = await this.subscriptionModel.findOrCreate({
      where: { doctorId: params.doctorId },
      defaults: {
        doctorId: params.doctorId,
        plan: params.plan,
        status: params.status,
        priceUsd: 0,
        currentPeriodStart: now,
        currentPeriodEnd: params.expiresAt,
        notes: params.notes ?? null,
      },
    });

    if (!created) {
      await this.subscriptionModel.update(
        {
          plan: params.plan,
          status: params.status,
          currentPeriodEnd: params.expiresAt,
          notes: params.notes ?? null,
          updatedAt: now,
        },
        { where: { doctorId: params.doctorId } },
      );
    }

    // Keep the profiles snapshot in sync
    await this.profileModel.update(
      {
        plan: params.plan,
        subscriptionStatus: params.status,
        subscriptionExpiresAt: params.expiresAt,
        updatedAt: now,
      },
      { where: { id: params.doctorId } },
    );
  }

  /**
   * Reads the current subscription snapshot from the profiles row (always present
   * for a doctor; the subscriptions row may not exist). Returns null if no profile.
   */
  async getSubscriptionSnapshot(doctorId: string): Promise<SubscriptionSnapshot | null> {
    const profile = await this.profileModel.findByPk(doctorId);
    if (!profile) return null;
    return {
      doctorId,
      plan: (profile.plan ?? null) as SubscriptionPlan | null,
      status: (profile.subscriptionStatus ?? null) as SubscriptionStatus | null,
      expiresAt: profile.subscriptionExpiresAt ?? null,
    };
  }

  /**
   * Applies a manual subscription change (extend/suspend/reactivate) atomically:
   *   1. Upsert the subscriptions row (findOrCreate + targeted UPDATE when exists).
   *   2. Sync the profiles snapshot.
   *   3. Append an immutable subscription_changes_log entry.
   * Mirrors the billing approveAndExtend transaction (same tables / log shape).
   */
  async applyManualSubscriptionChange(params: ManualSubscriptionChangeParams): Promise<void> {
    const t = await this.sequelize.transaction();
    try {
      const now = new Date();

      // Upsert: if the subscription row is missing (legacy doctor not yet
      // backfilled), create it; otherwise fall through to the targeted UPDATE.
      const [, subCreated] = await this.subscriptionModel.findOrCreate({
        where: { doctorId: params.doctorId },
        defaults: {
          doctorId: params.doctorId,
          plan: (params.newPlan ?? 'delta_free') as SubscriptionPlan,
          status: params.newStatus,
          priceUsd: 0,
          currentPeriodStart: now,
          currentPeriodEnd: params.newExpiresAt ?? now,
          notes: null,
        },
        transaction: t,
      });

      if (!subCreated) {
        const subUpdate: Record<string, unknown> = { status: params.newStatus, updatedAt: now };
        if (params.newExpiresAt) subUpdate.currentPeriodEnd = params.newExpiresAt;
        if (params.newPlan) subUpdate.plan = params.newPlan;
        await this.subscriptionModel.update(subUpdate, {
          where: { doctorId: params.doctorId },
          transaction: t,
        });
      }

      const profileUpdate: Record<string, unknown> = {
        subscriptionStatus: params.newStatus,
        updatedAt: now,
      };
      if (params.newExpiresAt) profileUpdate.subscriptionExpiresAt = params.newExpiresAt;
      if (params.newPlan) profileUpdate.plan = params.newPlan;
      await this.profileModel.update(profileUpdate, {
        where: { id: params.doctorId },
        transaction: t,
      });

      await this.sequelize.query(
        `INSERT INTO subscription_changes_log
           (id, doctor_id, action, actor_id, actor_role, reason, subscription_expires_at, metadata, created_at)
         VALUES
           (uuid_generate_v4(), :doctorId, :action, :actorId, :actorRole, :reason, :expiresAt, CAST(:metadata AS jsonb), now())`,
        {
          replacements: {
            doctorId: params.doctorId,
            action: params.action,
            actorId: params.actorId,
            actorRole: params.actorRole,
            reason: params.reason ?? null,
            expiresAt: params.newExpiresAt ?? null,
            metadata: JSON.stringify(params.metadata ?? {}),
          },
          type: QueryTypes.INSERT,
          transaction: t,
        },
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Plans
  // ---------------------------------------------------------------------------

  async listPlans(): Promise<PlanConfig[]> {
    const rows = await this.planConfigModel.findAll({
      order: [['sortOrder', 'ASC']],
    });
    return rows.map((r) => this.planRowToVo(r));
  }

  async listPlansWithDetails(): Promise<PlanDetail[]> {
    const planRows = await this.planConfigModel.findAll({
      order: [['sortOrder', 'ASC']],
    });

    if (planRows.length === 0) return [];

    const planKeys = planRows.map((r) => r.planKey);

    // Load features and prices for all plans in two queries (not N+1)
    const featureRows = await this.planFeatureModel.findAll({
      where: { plan: planKeys },
      order: [
        ['plan', 'ASC'],
        ['featureKey', 'ASC'],
      ],
    });

    const priceRows = await this.planPriceModel.findAll({
      where: { planKey: planKeys },
      order: [
        ['planKey', 'ASC'],
        ['period', 'ASC'],
      ],
    });

    // Group by planKey
    const featuresByPlan = new Map<string, PlanFeatureRow[]>();
    for (const fr of featureRows) {
      const list = featuresByPlan.get(fr.plan) ?? [];
      list.push({
        id: fr.id,
        plan: fr.plan,
        featureKey: fr.featureKey,
        featureLabel: fr.featureLabel,
        enabled: fr.enabled,
      });
      featuresByPlan.set(fr.plan, list);
    }

    const pricesByPlan = new Map<string, PlanPriceRow[]>();
    for (const pr of priceRows) {
      const list = pricesByPlan.get(pr.planKey) ?? [];
      list.push(this.priceRowToDto(pr));
      pricesByPlan.set(pr.planKey, list);
    }

    return planRows.map((r) => ({
      planKey: r.planKey,
      name: r.name,
      priceUsd: Number(r.price),
      trialDays: r.trialDays ?? 0,
      isActive: r.isActive ?? true,
      description: r.description ?? null,
      sortOrder: r.sortOrder ?? 0,
      roleKey: r.roleKey ?? 'doctor',
      isPermanent: r.isPermanent ?? false,
      prices: pricesByPlan.get(r.planKey) ?? [],
      features: featuresByPlan.get(r.planKey) ?? [],
    }));
  }

  async findPlanByKey(planKey: string): Promise<PlanConfig | null> {
    const row = await this.planConfigModel.findOne({ where: { planKey } });
    if (!row) return null;
    return this.planRowToVo(row);
  }

  async createPlan(params: CreatePlanParams): Promise<PlanConfig> {
    const row = await this.planConfigModel.create({
      planKey: params.planKey,
      name: params.name,
      price: 0,
      currency: 'USD',
      trialDays: 0,
      description: params.description ?? null,
      isActive: params.isActive,
      sortOrder: params.sortOrder,
      roleKey: params.roleKey,
      isPermanent: params.isPermanent,
    } as Parameters<typeof PlanConfigModel.create>[0]);
    return this.planRowToVo(row as PlanConfigModel);
  }

  async togglePlan(planKey: string, isActive: boolean): Promise<PlanConfig> {
    const [affectedCount] = await this.planConfigModel.update(
      { isActive, updatedAt: new Date() },
      { where: { planKey } },
    );

    // affectedCount === 0 means the plan disappeared between the existence check
    // in TogglePlanUseCase and this update — a race condition or external deletion.
    if (affectedCount === 0) {
      throw new Error(
        `Plan '${planKey}' could not be updated — it may have been deleted concurrently`,
      );
    }

    const updated = await this.planConfigModel.findOne({ where: { planKey } });
    if (!updated) {
      throw new Error(`Plan '${planKey}' disappeared after update`);
    }
    return this.planRowToVo(updated);
  }

  // ---------------------------------------------------------------------------
  // Plan features
  // ---------------------------------------------------------------------------

  async listPlanFeatures(planKey?: string): Promise<PlanFeatureRow[]> {
    const where: Record<string, unknown> = {};
    if (planKey) where.plan = planKey;

    const rows = await this.planFeatureModel.findAll({
      where,
      order: [
        ['plan', 'ASC'],
        ['featureKey', 'ASC'],
      ],
    });

    return rows.map((r) => ({
      id: r.id,
      plan: r.plan,
      featureKey: r.featureKey,
      featureLabel: r.featureLabel,
      enabled: r.enabled,
    }));
  }

  async upsertPlanFeature(
    planKey: string,
    featureKey: string,
    featureLabel: string,
    enabled: boolean,
    transaction?: Transaction,
  ): Promise<PlanFeatureRow> {
    // Raw SQL upsert using the named unique constraint from the spec (T-03):
    //   CONSTRAINT plan_features_plan_feature_key_key UNIQUE (plan, feature_key)
    // This avoids relying on Sequelize's internal conflictFields cast with
    // PlanFeatureModel['_attributes'], which is an undocumented internal type.
    const rows = await this.sequelize.query<{
      id: string;
      plan: string;
      feature_key: string;
      feature_label: string;
      enabled: boolean;
    }>(
      `INSERT INTO plan_features (id, plan, feature_key, feature_label, enabled, created_at, updated_at)
       VALUES (gen_random_uuid(), :plan, :featureKey, :featureLabel, :enabled, NOW(), NOW())
       ON CONFLICT ON CONSTRAINT plan_features_plan_feature_key_key
       DO UPDATE SET
         feature_label = EXCLUDED.feature_label,
         enabled       = EXCLUDED.enabled,
         updated_at    = NOW()
       RETURNING id, plan, feature_key, feature_label, enabled`,
      {
        type: QueryTypes.SELECT,
        replacements: { plan: planKey, featureKey, featureLabel, enabled },
        transaction,
      },
    );

    const row = rows[0];
    if (!row) {
      throw new Error(
        `upsertPlanFeature returned no row for plan=${planKey} feature=${featureKey}`,
      );
    }

    return {
      id: row.id,
      plan: row.plan,
      featureKey: row.feature_key,
      featureLabel: row.feature_label,
      enabled: row.enabled,
    };
  }

  async setPlanFeatures(
    planKey: string,
    features: Array<{ featureKey: string; featureLabel: string; enabled: boolean }>,
  ): Promise<PlanFeatureRow[]> {
    return this.sequelize.transaction(async (t) => {
      return Promise.all(
        features.map((f) =>
          this.upsertPlanFeature(planKey, f.featureKey, f.featureLabel, f.enabled, t),
        ),
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Plan prices
  // ---------------------------------------------------------------------------

  async listPlanPrices(planKey?: string): Promise<PlanPriceRow[]> {
    const where: Record<string, unknown> = {};
    if (planKey) where.planKey = planKey;

    const rows = await this.planPriceModel.findAll({
      where,
      order: [
        ['planKey', 'ASC'],
        ['period', 'ASC'],
      ],
    });

    return rows.map((r) => this.priceRowToDto(r));
  }

  async upsertPlanPrice(
    params: SetPlanPriceParams,
    transaction?: Transaction,
  ): Promise<PlanPriceRow> {
    const rows = await this.sequelize.query<{
      id: string;
      plan_key: string;
      period: string;
      price_usd: string;
      is_active: boolean;
    }>(
      `INSERT INTO plan_prices (id, plan_key, period, price_usd, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), :planKey, :period, :priceUsd, :isActive, NOW(), NOW())
       ON CONFLICT (plan_key, period)
       DO UPDATE SET
         price_usd  = EXCLUDED.price_usd,
         is_active  = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING id, plan_key, period, price_usd, is_active`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          planKey: params.planKey,
          period: params.period,
          priceUsd: params.priceUsd,
          isActive: params.isActive,
        },
        transaction,
      },
    );

    const row = rows[0];
    if (!row) {
      throw new PlanPriceUpsertError(params.planKey, params.period);
    }

    return {
      id: row.id,
      planKey: row.plan_key,
      period: row.period as import('../../../domain/value-objects/plan-price.vo').BillingPeriod,
      priceUsd: Number(row.price_usd),
      isActive: row.is_active,
    };
  }

  async setPlanPrices(planKey: string, prices: SetPlanPriceParams[]): Promise<PlanPriceRow[]> {
    return this.sequelize.transaction(async (t) => {
      return Promise.all(prices.map((p) => this.upsertPlanPrice({ ...p, planKey }, t)));
    });
  }

  async findPermanentPlanForRole(roleKey: string): Promise<PlanConfig | null> {
    const row = await this.planConfigModel.findOne({
      where: { roleKey, isPermanent: true, isActive: true },
      order: [['sortOrder', 'ASC']],
    });
    if (!row) return null;
    return this.planRowToVo(row);
  }

  // ---------------------------------------------------------------------------
  // Patients stats (no PII)
  // ---------------------------------------------------------------------------

  async getPatientStats(): Promise<PatientStats> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch all aggregate scalars in a single round-trip.
    // birth_date is DATEONLY (not encrypted) — safe to use in age arithmetic.
    // Ages outside (0, 130) are excluded to filter null/implausible values.
    interface AggRow {
      total_patients: string;
      total_consultations: string;
      total_appointments: string;
      active_patients_last_30_days: string;
      avg_age: string | null;
    }

    const [agg] = await this.sequelize.query<AggRow>(
      `SELECT
         (SELECT COUNT(*)                  FROM patients)                                     AS total_patients,
         (SELECT COUNT(*)                  FROM consultations)                                AS total_consultations,
         (SELECT COUNT(*)                  FROM appointments)                                 AS total_appointments,
         (SELECT COUNT(DISTINCT patient_id)
            FROM appointments
           WHERE scheduled_at >= :since
             AND patient_id IS NOT NULL)                                                      AS active_patients_last_30_days,
         (SELECT FLOOR(AVG(
                   EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date::date))
                 ))
            FROM patients
           WHERE birth_date IS NOT NULL
             AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date::date)) > 0
             AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date::date)) < 130)               AS avg_age`,
      {
        type: QueryTypes.SELECT,
        replacements: { since: thirtyDaysAgo },
      },
    );

    const totalPatients = parseInt(agg?.total_patients ?? '0', 10);
    const totalConsultations = parseInt(agg?.total_consultations ?? '0', 10);
    const totalAppointments = parseInt(agg?.total_appointments ?? '0', 10);
    const activePatientsLast30Days = parseInt(agg?.active_patients_last_30_days ?? '0', 10);
    const avgAge = agg?.avg_age != null ? parseInt(agg.avg_age, 10) : 0;

    // LIMIT 100 is intentional — the admin dashboard only needs the top-N doctors
    // by patient count for display purposes. If the platform grows beyond 100 active
    // doctors, revisit whether pagination is needed here.
    const byDoctorResult = await this.sequelize.query<PatientCountRow>(
      `SELECT doctor_id, COUNT(*) as count FROM patients GROUP BY doctor_id ORDER BY count DESC LIMIT 100`,
      { type: QueryTypes.SELECT },
    );

    const patientsByDoctor = byDoctorResult.map((r) => ({
      doctorId: r.doctor_id,
      count: parseInt(r.count, 10),
    }));

    return {
      totalPatients,
      patientsByDoctor,
      totalConsultations,
      totalAppointments,
      activePatientsLast30Days,
      avgAge,
    };
  }

  // ---------------------------------------------------------------------------
  // App settings
  // ---------------------------------------------------------------------------

  async getSettings(): Promise<AppSetting[]> {
    const rows = await this.sequelize.query<{ key: string; value: string; updated_at: Date }>(
      `SELECT key, value, updated_at FROM app_settings WHERE key NOT IN (:hiddenKeys) ORDER BY key`,
      {
        type: QueryTypes.SELECT,
        replacements: { hiddenKeys: [...HIDDEN_SETTING_KEYS] },
      },
    );

    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedAt: r.updated_at,
    }));
  }

  // ---------------------------------------------------------------------------
  // App settings — upsert
  // ---------------------------------------------------------------------------

  async upsertSetting(key: string, value: string): Promise<AppSetting> {
    const rows = await this.sequelize.query<{ key: string; value: string; updated_at: Date }>(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (:key, :value, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING key, value, updated_at`,
      {
        type: QueryTypes.SELECT,
        replacements: { key, value },
      },
    );

    const row = rows[0];
    if (!row) {
      throw new Error(`upsertSetting returned no row for key='${key}'`);
    }
    return { key: row.key, value: row.value, updatedAt: row.updated_at };
  }

  // ---------------------------------------------------------------------------
  // Plans — editable fields update
  // ---------------------------------------------------------------------------

  async updatePlan(params: UpdatePlanParams): Promise<PlanConfig> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (params.name !== undefined) updates.name = params.name;
    if (params.price !== undefined) updates.price = params.price;
    if (params.trialDays !== undefined) updates.trialDays = params.trialDays;
    if (params.sortOrder !== undefined) updates.sortOrder = params.sortOrder;
    if (params.isActive !== undefined) updates.isActive = params.isActive;
    if (params.isPermanent !== undefined) updates.isPermanent = params.isPermanent;
    // description: undefined = no-op; null = clear; string = set
    if (params.description !== undefined) updates.description = params.description;

    await this.planConfigModel.update(updates, { where: { planKey: params.planKey } });

    const updated = await this.planConfigModel.findOne({ where: { planKey: params.planKey } });
    if (!updated) {
      throw new Error(`Plan '${params.planKey}' disappeared after update`);
    }
    return this.planRowToVo(updated);
  }

  // ---------------------------------------------------------------------------
  // Admin user management
  // ---------------------------------------------------------------------------

  async listAdminUsers(): Promise<AdminUserRow[]> {
    const rows = await this.profileModel.findAll({
      where: { role: 'super_admin' },
      order: [['createdAt', 'ASC']],
    });
    return rows.map((r) => this.profileRowToAdminUser(r));
  }

  async findProfileById(userId: string): Promise<AdminUserRow | null> {
    const row = await this.profileModel.findByPk(userId);
    if (!row) return null;
    return this.profileRowToAdminUser(row);
  }

  async countSuperAdmins(): Promise<number> {
    const result = await this.sequelize.query<CountRow>(
      `SELECT COUNT(*) as count FROM profiles WHERE role = 'super_admin'`,
      { type: QueryTypes.SELECT },
    );
    return parseInt(result[0]?.count ?? '0', 10);
  }

  async setUserRole(userId: string, role: string): Promise<void> {
    await this.profileModel.update({ role, updatedAt: new Date() }, { where: { id: userId } });
  }

  // ---------------------------------------------------------------------------
  // Dashboard overview (supplemental KPIs)
  // ---------------------------------------------------------------------------

  async getDashboardOverview(): Promise<DashboardOverview> {
    const now = new Date();
    // Today boundaries in UTC (simple, stable — no TZ dependency on server)
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const todayEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    // Current month boundaries
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    interface OverviewAggRow {
      appts_today: string;
      appts_this_month: string;
      active_subs: string;
      trial_subs: string;
    }

    const [agg] = await this.sequelize.query<OverviewAggRow>(
      `SELECT
         -- Appointments today (appointments table)
         (SELECT COUNT(*) FROM appointments
           WHERE scheduled_at >= :todayStart AND scheduled_at < :todayEnd)
         +
         -- Walk-in consultations today without a linked appointment
         (SELECT COUNT(*) FROM consultations
           WHERE consultation_date >= :todayStart AND consultation_date < :todayEnd
             AND appointment_id IS NULL)
           AS appts_today,

         -- Appointments this month
         (SELECT COUNT(*) FROM appointments
           WHERE scheduled_at >= :monthStart AND scheduled_at < :monthEnd)
         +
         (SELECT COUNT(*) FROM consultations
           WHERE consultation_date >= :monthStart AND consultation_date < :monthEnd
             AND appointment_id IS NULL)
           AS appts_this_month,

         -- Active subscriptions (doctor profiles)
         (SELECT COUNT(*) FROM profiles
           WHERE role = 'doctor' AND subscription_status = 'active')
           AS active_subs,

         -- Trial subscriptions (doctor profiles)
         (SELECT COUNT(*) FROM profiles
           WHERE role = 'doctor' AND plan = 'trial' AND subscription_status = 'trial')
           AS trial_subs`,
      {
        type: QueryTypes.SELECT,
        replacements: { todayStart, todayEnd, monthStart, monthEnd },
      },
    );

    const appointmentsToday = parseInt(agg?.appts_today ?? '0', 10);
    const appointmentsThisMonth = parseInt(agg?.appts_this_month ?? '0', 10);
    const activeSubscriptions = parseInt(agg?.active_subs ?? '0', 10);
    const trialSubscriptions = parseInt(agg?.trial_subs ?? '0', 10);

    // Top 5 most-recently registered doctors
    const recentRows = await this.profileModel.findAll({
      where: { role: 'doctor' },
      order: [['createdAt', 'DESC']],
      limit: 5,
    });

    const recentDoctors = recentRows.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      specialty: r.specialty ?? null,
      subscriptionStatus: r.subscriptionStatus ?? null,
      createdAt: r.createdAt,
    }));

    return {
      appointmentsToday,
      appointmentsThisMonth,
      activeSubscriptions,
      trialSubscriptions,
      recentDoctors,
    };
  }

  // ---------------------------------------------------------------------------
  // Recent doctors (notification bell)
  // ---------------------------------------------------------------------------

  async getRecentDoctors(days: number): Promise<RecentDoctorRow[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    interface RawDoctorRow {
      id: string;
      full_name: string;
      email: string;
      created_at: Date;
    }

    const rows = await this.sequelize.query<RawDoctorRow>(
      `SELECT id, full_name, email, created_at
         FROM profiles
        WHERE role = 'doctor'
          AND created_at >= :since
        ORDER BY created_at DESC
        LIMIT 10`,
      {
        type: QueryTypes.SELECT,
        replacements: { since },
      },
    );

    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      createdAt: r.created_at,
    }));
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  async exportDoctors(): Promise<DoctorExportRow[]> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    interface ExportRawRow {
      full_name: string;
      email: string;
      cedula: string | null;
      specialty: string | null;
      plan: string | null;
      subscription_status: string | null;
      subscription_expires_at: Date | null;
      last_sign_in_at: Date | null;
    }

    const rows = await this.sequelize.query<ExportRawRow>(
      `SELECT
         p.full_name,
         p.email,
         p.cedula,
         p.specialty,
         COALESCE(s.plan::text, p.plan)                   AS plan,
         COALESCE(s.status::text, p.subscription_status)  AS subscription_status,
         COALESCE(s.current_period_end, p.subscription_expires_at) AS subscription_expires_at,
         p.last_sign_in_at
       FROM profiles p
       LEFT JOIN subscriptions s ON s.doctor_id = p.id
       WHERE p.role = 'doctor'
       ORDER BY p.full_name ASC`,
      { type: QueryTypes.SELECT },
    );

    return rows.map((r): DoctorExportRow => {
      let activityStatus: 'active' | 'cold' | 'inactive';
      if (!r.last_sign_in_at) {
        activityStatus = 'inactive';
      } else if (r.last_sign_in_at >= sevenDaysAgo) {
        activityStatus = 'active';
      } else if (r.last_sign_in_at >= thirtyDaysAgo) {
        activityStatus = 'cold';
      } else {
        activityStatus = 'inactive';
      }

      return {
        fullName: r.full_name,
        email: r.email,
        cedula: r.cedula ?? null,
        specialty: r.specialty ?? null,
        plan: r.plan ?? null,
        subscriptionStatus: r.subscription_status ?? null,
        subscriptionExpiresAt: r.subscription_expires_at ?? null,
        lastSignInAt: r.last_sign_in_at ?? null,
        activityStatus,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Public stats (no PII)
  // ---------------------------------------------------------------------------

  async getPublicStats(): Promise<PublicStats> {
    interface StatsRow {
      specialists: string;
      patients: string;
    }

    // Prefer verified doctors (verification_status = 'verified') when the column
    // exists. If no verified rows are found, fall back to all doctors with role='doctor'.
    // patients is a simple total count — no PII.
    const [row] = await this.sequelize.query<StatsRow>(
      `SELECT
         (
           SELECT COALESCE(
             NULLIF(
               COUNT(*) FILTER (WHERE verification_status = 'verified'),
               0
             ),
             COUNT(*)
           )
           FROM profiles
           WHERE role = 'doctor'
         ) AS specialists,
         (SELECT COUNT(*) FROM patients) AS patients`,
      { type: QueryTypes.SELECT },
    );

    return {
      specialists: parseInt(row?.specialists ?? '0', 10),
      patients: parseInt(row?.patients ?? '0', 10),
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private profileRowToDomainWithSub(
    row: ProfileAdminModel,
    sub?: AdminSubscriptionModel,
  ): DoctorWithActivity {
    // Prefer live subscription data; fall back to profile snapshot columns
    const subscriptionStatus = (sub?.status ??
      row.subscriptionStatus ??
      'trial') as SubscriptionStatus;
    const subscriptionPlan = (sub?.plan ?? row.plan ?? 'trial') as SubscriptionPlan;
    const subscriptionExpiresAt = sub?.currentPeriodEnd ?? row.subscriptionExpiresAt ?? null;

    // Use real last_sign_in_at from the profiles row (column added in migration 20260612000002).
    const lastSignInAt: Date | null = row.lastSignInAt ?? null;

    // cedula is PII — admin-only context. Passed through to the domain entity so
    // the list and export surfaces can surface it when needed.
    const cedula: string | null = row.cedula ?? null;

    return new DoctorWithActivity(
      row.id,
      row.fullName,
      row.email,
      row.specialty,
      subscriptionStatus,
      subscriptionPlan,
      subscriptionExpiresAt,
      lastSignInAt,
      cedula,
    );
  }

  private profileRowToAdminUser(row: ProfileAdminModel): AdminUserRow {
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      role: row.role,
      createdAt: row.createdAt,
    };
  }

  private planRowToVo(row: PlanConfigModel): PlanConfigVO {
    return new PlanConfigVO(
      row.planKey,
      row.name,
      Number(row.price),
      row.trialDays ?? 0,
      row.isActive ?? true,
      row.description ?? null,
      row.sortOrder ?? 0,
      row.roleKey ?? 'doctor',
      row.isPermanent ?? false,
    );
  }

  private priceRowToDto(row: PlanPriceModel): PlanPriceRow {
    return {
      id: row.id,
      planKey: row.planKey,
      period: row.period,
      priceUsd: Number(row.priceUsd),
      isActive: row.isActive,
    };
  }

  // ---------------------------------------------------------------------------
  // Admin doctor provisioning
  // ---------------------------------------------------------------------------

  /**
   * Atomically creates a new doctor profile + subscription row.
   *
   * Plan / status / expiry logic mirrors the normal registration flow
   * (`sequelize-identity.repository.ts`) but allows the admin to override the
   * initial plan:
   *
   *   free_trial  → status=trialing,  period_end = now + 30 days  (default)
   *   delta_free  → status=active,    period_end = now + 99 years (permanent)
   *   delta_base  → status=active,    period_end = now + 30 days  (manual payment expected)
   *   delta_plus  → status=active,    period_end = now + 30 days  (manual payment expected)
   *
   * Throws DoctorEmailConflictError (409) when the email is already registered.
   */
  async createAdminDoctor(params: CreateAdminDoctorParams): Promise<AdminCreatedDoctorResult> {
    const now = new Date();

    // Determine plan/status/expiry from the requested plan (or default free_trial).
    const resolvedPlan = params.plan ?? 'free_trial';
    const { status, periodEnd } = resolveSubscriptionTerms(resolvedPlan, now);

    const t = await this.sequelize.transaction();
    try {
      const row = await this.profileModel.create(
        {
          id: params.id,
          fullName: params.fullName,
          email: params.email,
          role: 'doctor',
          isActive: true,
          plan: resolvedPlan,
          subscriptionStatus: status,
          specialty: params.specialty ?? null,
          cedula: params.cedula ?? null,
          phone: params.phone ?? null,
        } as Parameters<typeof ProfileAdminModel.create>[0],
        { transaction: t },
      );

      await this.subscriptionModel.findOrCreate({
        where: { doctorId: row.id },
        defaults: {
          doctorId: row.id,
          plan: resolvedPlan,
          status,
          priceUsd: 0,
          billingCycle: null,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt: resolvedPlan === 'free_trial' ? periodEnd : null,
          cancelledAt: null,
          notes: null,
        },
        transaction: t,
      });

      await t.commit();

      return {
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        specialty: row.specialty ?? null,
        cedula: row.cedula ?? null,
        plan: resolvedPlan,
        subscriptionStatus: status,
        subscriptionExpiresAt: periodEnd,
        createdAt: row.createdAt,
      };
    } catch (err) {
      await t.rollback();
      if (err instanceof UniqueConstraintError) {
        // Check if there's an existing profile with this email (case-insensitive)
        const existing = await this.profileModel.findOne({
          where: { email: { [Op.iLike]: params.email } },
        });
        if (existing) {
          throw new DoctorEmailConflictError(params.email);
        }
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Account access control (hard ban)
  // ---------------------------------------------------------------------------

  async setProfileActive(profileId: string, isActive: boolean): Promise<boolean> {
    const [affectedRows] = await this.profileModel.update(
      { isActive },
      { where: { id: profileId } },
    );

    if (affectedRows === 0) {
      // Profile does not exist — caller should have validated this, but guard here.
      throw new DoctorNotFoundError(profileId);
    }

    return isActive;
  }

  // ---------------------------------------------------------------------------
  // Admin: doctor → patient identity listing
  // ---------------------------------------------------------------------------

  /**
   * Returns patients attended by the given doctor with decrypted identity fields
   * and consultation aggregate data (count + last attended date).
   *
   * The query joins patients with consultations scoped to doctorId, so only
   * patients that have at least one consultation row are included. Patients
   * registered with this doctor but never seen appear in the outer join and will
   * have consultationCount=0 / lastAttendedAt=null.
   *
   * PHI decryption happens in-process after the raw query returns ciphertext.
   * Throws DoctorNotFoundError if the profile does not exist.
   *
   * SECURITY: caller MUST log an audit row per access (see logAdminReveal).
   */
  async listDoctorPatients(doctorId: string): Promise<DoctorPatientRow[]> {
    // Validate that the doctor exists before revealing any patient identity.
    const doctorExists = await this.profileModel.findOne({
      where: { id: doctorId, role: 'doctor' },
      attributes: ['id'],
    });
    if (!doctorExists) {
      throw new DoctorNotFoundError(doctorId);
    }

    interface PatientConsultationRow {
      patient_id: string;
      full_name: string;
      cedula: string | null;
      consultation_count: string;
      last_attended_at: Date | null;
    }

    // LEFT JOIN ensures patients with zero consultations appear with count=0.
    // Scoped strictly to doctorId on both the patients and consultations sides
    // to prevent cross-doctor data leaks.
    const rows = await this.sequelize.query<PatientConsultationRow>(
      `SELECT
         p.id                               AS patient_id,
         p.full_name                        AS full_name,
         p.cedula                           AS cedula,
         COUNT(c.id)::text                  AS consultation_count,
         MAX(c.consultation_date)           AS last_attended_at
       FROM patients p
       LEFT JOIN consultations c
         ON c.patient_id = p.id
        AND c.doctor_id  = :doctorId
       WHERE p.doctor_id   = :doctorId
         AND p.deleted_at IS NULL
       GROUP BY p.id, p.full_name, p.cedula
       ORDER BY p.full_name ASC`,
      {
        type: QueryTypes.SELECT,
        replacements: { doctorId },
      },
    );

    return rows.map((row) => ({
      id: row.patient_id,
      fullName: this.crypto.decrypt(row.full_name),
      cedula: row.cedula ? this.crypto.decrypt(row.cedula) : null,
      consultationCount: parseInt(row.consultation_count ?? '0', 10),
      lastAttendedAt: row.last_attended_at ? new Date(row.last_attended_at) : null,
    }));
  }

  /**
   * Inserts a single row into access_audit_log.
   * Fire-and-forget — errors MUST be swallowed by the caller (never propagate to response).
   */
  async logAdminReveal(entry: {
    actorId: string;
    actorRole: string;
    patientId: string;
    fieldRevealed: string;
    ipAddress: string | null;
    userAgent: string | null;
    reason?: string | null;
  }): Promise<void> {
    await this.auditLogModel.create({
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      patientId: entry.patientId,
      fieldRevealed: entry.fieldRevealed,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      reason: entry.reason ?? null,
    });
  }
}
