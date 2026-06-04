import type { SubscriptionStatus, SubscriptionPlan } from '@delta/shared-types';
import type { DoctorWithActivity } from '../entities/doctor-with-activity.entity';
import type { PlanConfig } from '../value-objects/plan-config.vo';

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

export interface PatientStats {
  totalPatients: number;
  patientsByDoctor: Array<{ doctorId: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Repository interface — implemented by infrastructure layer
// ---------------------------------------------------------------------------

export interface IAdminRepository {
  // Dashboard
  getDashboardData(): Promise<AdminDashboardData>;

  // Doctors
  listDoctors(filters: DoctorListFilters): Promise<DoctorListResult>;
  findDoctorById(doctorId: string): Promise<DoctorWithActivity | null>;

  // Subscriptions
  listSubscriptions(filters: SubscriptionListFilters): Promise<SubscriptionListResult>;
  updateDoctorSubscription(params: UpdateSubscriptionParams): Promise<void>;

  // Subscription manual ops (extend / suspend / reactivate)
  getSubscriptionSnapshot(doctorId: string): Promise<SubscriptionSnapshot | null>;
  applyManualSubscriptionChange(params: ManualSubscriptionChangeParams): Promise<void>;

  // Plans
  listPlans(): Promise<PlanConfig[]>;
  findPlanByKey(planKey: string): Promise<PlanConfig | null>;
  togglePlan(planKey: string, isActive: boolean): Promise<PlanConfig>;

  // Plan features
  listPlanFeatures(planKey?: string): Promise<PlanFeatureRow[]>;
  upsertPlanFeature(
    planKey: string,
    featureKey: string,
    featureLabel: string,
    enabled: boolean,
  ): Promise<PlanFeatureRow>;

  // Patients stats (no PII)
  getPatientStats(): Promise<PatientStats>;

  // App settings (no secrets)
  getSettings(): Promise<AppSetting[]>;
}
