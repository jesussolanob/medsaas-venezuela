import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import type {
  IAdminRepository,
  AdminDashboardData,
  DoctorListFilters,
  DoctorListResult,
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
} from '../../../domain/repositories/admin.repository';
import type { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanConfig as PlanConfigVO } from '../../../domain/value-objects/plan-config.vo';
import { DoctorWithActivity } from '../../../domain/entities/doctor-with-activity.entity';
import { ProfileAdminModel } from '../models/profile.model';
import { AdminSubscriptionModel } from '../models/subscription.model';
import { PlanConfigModel } from '../models/plan-config.model';
import { PlanFeatureModel } from '../models/plan-feature.model';
import type { SubscriptionPlan, SubscriptionStatus } from '@delta/shared-types';

// Sensitive keys that must never be returned from the settings endpoint
const HIDDEN_SETTING_KEYS = new Set(['encryption_key', 'jwt_secret', 'usdt_rate_raw']);

// Raw query row shapes
interface CountRow {
  count: string;
}

interface PatientCountRow {
  doctor_id: string;
  count: string;
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
    private readonly sequelize: Sequelize,
  ) {}

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  async getDashboardData(): Promise<AdminDashboardData> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Doctor count
    const totalDoctorsResult = await this.sequelize.query<CountRow>(
      `SELECT COUNT(*) as count FROM profiles WHERE role = 'doctor'`,
      { type: QueryTypes.SELECT },
    );
    const totalDoctors = parseInt(totalDoctorsResult[0]?.count ?? '0', 10);

    // Appointments in last 30 days
    const apptResult = await this.sequelize.query<CountRow>(
      `SELECT COUNT(*) as count FROM appointments WHERE created_at >= :since`,
      { type: QueryTypes.SELECT, replacements: { since: thirtyDaysAgo } },
    );
    const appointmentsLast30Days = parseInt(apptResult[0]?.count ?? '0', 10);

    // Total patients
    const patientResult = await this.sequelize.query<CountRow>(
      `SELECT COUNT(*) as count FROM patients`,
      { type: QueryTypes.SELECT },
    );
    const totalPatients = parseInt(patientResult[0]?.count ?? '0', 10);

    // Expiring subscriptions in next 7 days
    const expiringResult = await this.sequelize.query<CountRow>(
      `SELECT COUNT(*) as count
       FROM subscriptions
       WHERE status IN ('active', 'trial')
         AND current_period_end BETWEEN NOW() AND :deadline`,
      { type: QueryTypes.SELECT, replacements: { deadline: sevenDaysFromNow } },
    );
    const expiringSubscriptionsCount = parseInt(expiringResult[0]?.count ?? '0', 10);

    // Activity breakdown — in Etapa 1 all doctors are 'inactive' (no lastSignInAt)
    // These counts will be accurate once Fase 4 (Auth0 login tracking) is in place.
    const activeDoctors = 0;
    const coldDoctors = 0;
    const inactiveDoctors = totalDoctors;

    return {
      totalDoctors,
      activeDoctors,
      coldDoctors,
      inactiveDoctors,
      appointmentsLast30Days,
      totalPatients,
      expiringSubscriptionsCount,
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
   *   1. Update the subscriptions row (if present — 0 rows is harmless).
   *   2. Sync the profiles snapshot.
   *   3. Append an immutable subscription_changes_log entry.
   * Mirrors the billing approveAndExtend transaction (same tables / log shape).
   */
  async applyManualSubscriptionChange(params: ManualSubscriptionChangeParams): Promise<void> {
    const t = await this.sequelize.transaction();
    try {
      const now = new Date();

      const subUpdate: Record<string, unknown> = { status: params.newStatus, updatedAt: now };
      if (params.newExpiresAt) subUpdate.currentPeriodEnd = params.newExpiresAt;
      if (params.newPlan) subUpdate.plan = params.newPlan;
      await this.subscriptionModel.update(subUpdate, {
        where: { doctorId: params.doctorId },
        transaction: t,
      });

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

  async findPlanByKey(planKey: string): Promise<PlanConfig | null> {
    const row = await this.planConfigModel.findOne({ where: { planKey } });
    if (!row) return null;
    return this.planRowToVo(row);
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

  // ---------------------------------------------------------------------------
  // Patients stats (no PII)
  // ---------------------------------------------------------------------------

  async getPatientStats(): Promise<PatientStats> {
    const totalResult = await this.sequelize.query<CountRow>(
      `SELECT COUNT(*) as count FROM patients`,
      { type: QueryTypes.SELECT },
    );
    const totalPatients = parseInt(totalResult[0]?.count ?? '0', 10);

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

    return { totalPatients, patientsByDoctor };
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

    // lastSignInAt is always null in Etapa 1 — requires Auth0 (Fase 4).
    const lastSignInAt: Date | null = null;

    return new DoctorWithActivity(
      row.id,
      row.fullName,
      row.email,
      row.specialty,
      subscriptionStatus,
      subscriptionPlan,
      subscriptionExpiresAt,
      lastSignInAt,
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
    );
  }
}
