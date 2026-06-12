import type { SubscriptionStatus, SubscriptionPlan } from '@delta/shared-types';
import type { DoctorWithActivity } from '../entities/doctor-with-activity.entity';
import type { PlanConfig } from '../value-objects/plan-config.vo';
import type { BillingPeriod } from '../value-objects/plan-price.vo';

export const ADMIN_REPOSITORY = Symbol('IAdminRepository');

// ---------------------------------------------------------------------------
// Filter and result types
// ---------------------------------------------------------------------------

export type ActivityStatus = 'active' | 'cold' | 'inactive';

export interface DoctorListFilters {
  page: number;
  limit: number;
  activityStatus?: ActivityStatus;
  subscriptionStatus?: SubscriptionStatus;
}

export interface DoctorListResult {
  items: DoctorWithActivity[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminDashboardData {
  totalDoctors: number;
  activeDoctors: number;
  coldDoctors: number;
  inactiveDoctors: number;
  appointmentsLast30Days: number;
  totalPatients: number;
  expiringSubscriptionsCount: number;
}

export interface SubscriptionListFilters {
  page: number;
  limit: number;
  status?: SubscriptionStatus;
  plan?: SubscriptionPlan;
}

/**
 * Subscription row enriched with doctor identity for admin display.
 *
 * SECURITY NOTE: `doctorName` and `doctorEmail` are PII. This type is
 * intentionally admin-only — it must never be reused in non-super_admin
 * contexts, exported to non-admin use cases, or included in logs.
 * The admin controller that exposes this data is guarded by
 * @Roles('super_admin') at the class level.
 */
export interface SubscriptionRow {
  id: string;
  doctorId: string;
  /** PII — doctor's full name. Admin-only context. */
  doctorName: string;
  /** PII — doctor's email. Admin-only context. Do NOT log. */
  doctorEmail: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  priceUsd: number;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  createdAt: Date;
}

export interface SubscriptionListResult {
  items: SubscriptionRow[];
  total: number;
  page: number;
  limit: number;
}

export interface UpdateSubscriptionParams {
  doctorId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  expiresAt: Date;
  notes?: string | null;
}

/** Current subscription snapshot read from the profiles row (always present). */
export interface SubscriptionSnapshot {
  doctorId: string;
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus | null;
  expiresAt: Date | null;
}

export type SubscriptionChangeAction = 'extended' | 'suspended' | 'reactivated' | 'manual_grant';

/** Manual subscription operation (extend/suspend/reactivate) applied atomically. */
export interface ManualSubscriptionChangeParams {
  doctorId: string;
  action: SubscriptionChangeAction;
  actorId: string;
  actorRole: string;
  reason?: string | null;
  newStatus: SubscriptionStatus;
  /** When provided, updates current_period_end / subscription_expires_at. */
  newExpiresAt?: Date | null;
  /** When provided, updates the plan (e.g. trial → basic on first paid extend). */
  newPlan?: SubscriptionPlan | null;
  metadata?: Record<string, unknown>;
}

export interface PlanFeatureRow {
  id: string;
  plan: string;
  featureKey: string;
  featureLabel: string;
  enabled: boolean;
}

export interface AppSetting {
  key: string;
  value: string;
  updatedAt: Date;
}

/** Lightweight profile row for admin listing (PII — admin-only context). */
export interface AdminUserRow {
  id: string;
  /** PII — full name. Admin-only context. */
  fullName: string;
  /** PII — email. Admin-only context. Do NOT log. */
  email: string;
  role: string;
  createdAt: Date;
}

/** Fields that super_admin can edit on a plan_config row. */
export interface UpdatePlanParams {
  planKey: string;
  name?: string;
  price?: number;
  trialDays?: number;
  sortOrder?: number;
  /** undefined = do not touch; null = clear the description; string = new value. */
  description?: string | null;
  isActive?: boolean;
  isPermanent?: boolean;
}

/** Parameters for creating a new plan_config row. */
export interface CreatePlanParams {
  planKey: string;
  name: string;
  roleKey: string;
  isPermanent: boolean;
  isActive: boolean;
  sortOrder: number;
  description?: string | null;
}

/** One row in plan_prices. */
export interface PlanPriceRow {
  id: string;
  planKey: string;
  period: BillingPeriod;
  priceUsd: number;
  isActive: boolean;
}

/** Input for setting a single period price entry. */
export interface SetPlanPriceParams {
  planKey: string;
  period: BillingPeriod;
  priceUsd: number;
  isActive: boolean;
}

/** Enriched plan returned by admin list — includes prices and features. */
export interface PlanDetail {
  planKey: string;
  name: string;
  priceUsd: number;
  trialDays: number;
  isActive: boolean;
  description: string | null;
  sortOrder: number;
  roleKey: string;
  isPermanent: boolean;
  prices: PlanPriceRow[];
  features: PlanFeatureRow[];
}

export interface PatientStats {
  totalPatients: number;
  patientsByDoctor: Array<{ doctorId: string; count: number }>;
  /** Total rows in the consultations table (no PII). */
  totalConsultations: number;
  /** Total rows in the appointments table (no PII). */
  totalAppointments: number;
  /** Distinct patient_ids in appointments with scheduled_at within the last 30 days. */
  activePatientsLast30Days: number;
  /**
   * Integer average age derived from patients.birth_date.
   * Rows without a birth_date or with an implausible age (≤0 or ≥130) are excluded.
   * Returns 0 when no valid birth_date rows exist.
   * NOTE: birth_date is DATEONLY (not encrypted) — safe to aggregate.
   */
  avgAge: number;
}

/**
 * Enriched doctor detail — extends base identity with profile fields and
 * activity stats scoped to the current month.
 *
 * NOTE: phone and cedula are PII. This type is admin-only; never use it
 * outside super_admin-guarded contexts and never log its fields.
 */
export interface DoctorDetail {
  id: string;
  /** PII — full name. Admin-only. */
  fullName: string;
  /** PII — email. Admin-only. Do NOT log. */
  email: string;
  specialty: string | null;
  /** PII — phone. Admin-only. Do NOT log. */
  phone: string | null;
  /** PII — cedula. Admin-only. Do NOT log. */
  cedula: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean | null;
  createdAt: Date;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: Date | null;
  activityStatus: 'active' | 'cold' | 'inactive';
  lastSignInAt: Date | null;
  /** Total patients assigned to this doctor (soft-deleted excluded). */
  patientCount: number;
  /** Consultations created in the current calendar month. */
  consultationCount: number;
  /** Sum of approved consultation amounts in the current calendar month (0 if none). */
  monthlyRevenue: number;
}

/** One data point in the doctor-growth chart. */
export interface DoctorGrowthPoint {
  /** Calendar month in YYYY-MM format (e.g. "2026-06"). */
  month: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Dashboard overview (supplemental KPIs) — no patient PII
// ---------------------------------------------------------------------------

/** Lightweight doctor row for "recent doctors" notification bell. */
export interface RecentDoctorRow {
  id: string;
  /** PII — full name. Admin-only. */
  fullName: string;
  /** PII — email. Admin-only. */
  email: string;
  createdAt: Date;
}

/**
 * Additional KPIs for the admin home dashboard (complements AdminDashboardData).
 * These fields are intentionally separated to avoid invalidating the existing cache.
 */
export interface DashboardOverview {
  appointmentsToday: number;
  appointmentsThisMonth: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  recentDoctors: Array<{
    id: string;
    /** PII — full name. Admin-only. */
    fullName: string;
    specialty: string | null;
    subscriptionStatus: string | null;
    createdAt: Date;
  }>;
}

export interface DoctorGrowthData {
  chartData: DoctorGrowthPoint[];
  /** New doctor registrations in the current calendar month. */
  newThisMonth: number;
  /**
   * Month-over-month growth percentage vs the previous month.
   * Rounded integer. 0 when the previous month had 0 registrations
   * (avoids Infinity / division-by-zero).
   */
  momGrowth: number;
}

// ---------------------------------------------------------------------------
// Repository interface — implemented by infrastructure layer
// ---------------------------------------------------------------------------

export interface IAdminRepository {
  // Dashboard
  getDashboardData(): Promise<AdminDashboardData>;

  /** Supplemental KPIs for the admin home (appointments today/month, subscription counts, recent doctors). */
  getDashboardOverview(): Promise<DashboardOverview>;

  /** Returns doctors created within the last N days, ordered by created_at desc, limit 10. */
  getRecentDoctors(days: number): Promise<RecentDoctorRow[]>;

  // Doctors
  listDoctors(filters: DoctorListFilters): Promise<DoctorListResult>;
  findDoctorById(doctorId: string): Promise<DoctorWithActivity | null>;
  findDoctorDetail(doctorId: string): Promise<DoctorDetail | null>;

  // Growth analytics
  getDoctorGrowth(): Promise<DoctorGrowthData>;

  // Subscriptions
  listSubscriptions(filters: SubscriptionListFilters): Promise<SubscriptionListResult>;
  updateDoctorSubscription(params: UpdateSubscriptionParams): Promise<void>;

  // Subscription manual ops (extend / suspend / reactivate)
  getSubscriptionSnapshot(doctorId: string): Promise<SubscriptionSnapshot | null>;
  applyManualSubscriptionChange(params: ManualSubscriptionChangeParams): Promise<void>;

  // Plans
  listPlans(): Promise<PlanConfig[]>;
  /** Returns enriched plan detail including prices[] and features[]. */
  listPlansWithDetails(): Promise<PlanDetail[]>;
  findPlanByKey(planKey: string): Promise<PlanConfig | null>;
  togglePlan(planKey: string, isActive: boolean): Promise<PlanConfig>;
  createPlan(params: CreatePlanParams): Promise<PlanConfig>;

  // Plan features
  listPlanFeatures(planKey?: string): Promise<PlanFeatureRow[]>;
  upsertPlanFeature(
    planKey: string,
    featureKey: string,
    featureLabel: string,
    enabled: boolean,
  ): Promise<PlanFeatureRow>;
  /** Bulk-set the feature matrix for a plan. Overwrites all existing entries. */
  setPlanFeatures(
    planKey: string,
    features: Array<{ featureKey: string; featureLabel: string; enabled: boolean }>,
  ): Promise<PlanFeatureRow[]>;

  // Plan prices
  listPlanPrices(planKey?: string): Promise<PlanPriceRow[]>;
  /** Upsert a single price entry for (planKey, period). */
  upsertPlanPrice(params: SetPlanPriceParams): Promise<PlanPriceRow>;
  /** Bulk-set prices for a plan. Overwrites all existing entries for that plan. */
  setPlanPrices(planKey: string, prices: SetPlanPriceParams[]): Promise<PlanPriceRow[]>;

  // Patients stats (no PII)
  getPatientStats(): Promise<PatientStats>;

  // App settings (no secrets)
  getSettings(): Promise<AppSetting[]>;
  upsertSetting(key: string, value: string): Promise<AppSetting>;

  // Plans — extended edit
  updatePlan(params: UpdatePlanParams): Promise<PlanConfig>;

  /**
   * Returns the first permanent plan for the given role key.
   * Used by the lazy-downgrade logic in GetDoctorFeaturesV2UseCase.
   */
  findPermanentPlanForRole(roleKey: string): Promise<PlanConfig | null>;

  // Admin user management (via profiles.role)
  listAdminUsers(): Promise<AdminUserRow[]>;
  findProfileById(userId: string): Promise<AdminUserRow | null>;
  countSuperAdmins(): Promise<number>;
  setUserRole(userId: string, role: string): Promise<void>;

  // Export (admin-only, no PII of patients)
  exportDoctors(): Promise<DoctorExportRow[]>;

  // Public stats (no PII, no auth required)
  getPublicStats(): Promise<PublicStats>;
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

/**
 * One row in the doctor export CSV.
 * All fields are doctor identity — PII in an admin-only context.
 */
export interface DoctorExportRow {
  /** PII — full name. Admin export only. */
  fullName: string;
  /** PII — email. Admin export only. */
  email: string;
  /** PII — cedula. Admin export only. */
  cedula: string | null;
  specialty: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiresAt: Date | null;
  lastSignInAt: Date | null;
  activityStatus: 'active' | 'cold' | 'inactive';
}

/**
 * Public aggregate counts — no PII whatsoever.
 * Safe to expose on the landing page without authentication.
 */
export interface PublicStats {
  /** COUNT of doctor profiles (verified if verification_status column exists, else all active). */
  specialists: number;
  /** COUNT of total patient rows. */
  patients: number;
}
