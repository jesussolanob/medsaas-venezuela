/**
 * ILoginTouchRepository
 *
 * Focused interface for the login-touch operation.
 * Handles the three atomic concerns:
 *   1. Recording last_sign_in_at on every login.
 *   2. Looking up a doctor's active subscription.
 *   3. Persisting a lazy downgrade when a subscription has expired.
 *
 * Domain layer — no Sequelize or NestJS imports.
 */

export const LOGIN_TOUCH_REPOSITORY = Symbol('ILoginTouchRepository');

/** Minimal subscription data required for expiry evaluation. */
export interface LoginTouchSubscription {
  id: string;
  doctorId: string;
  status: string;
  currentPeriodEnd: Date;
  plan: string;
}

/** Minimal plan config data required for permanent-plan check. */
export interface LoginTouchPlanConfig {
  planKey: string;
  isPermanent: boolean;
}

export interface ILoginTouchRepository {
  /**
   * Find the active/trial subscription for a doctor.
   * Returns null if the doctor has no subscription row.
   */
  findSubscriptionByDoctorId(doctorId: string): Promise<LoginTouchSubscription | null>;

  /**
   * Find a plan_config entry by its key.
   * Returns null when not found.
   */
  findPlanConfigByKey(planKey: string): Promise<LoginTouchPlanConfig | null>;

  /**
   * Atomically:
   *   1. Set profiles.last_sign_in_at = now() for the given profileId.
   *   2. Flip subscriptions.status to 'past_due' for the given doctor.
   *   3. Sync profiles.subscription_status = 'past_due'.
   *   4. Insert into subscription_changes_log.
   */
  persistDowngradeAndTouch(profileId: string, doctorId: string): Promise<void>;

  /**
   * Set profiles.last_sign_in_at = now() without any subscription change.
   */
  touchLastSignInAt(profileId: string): Promise<void>;
}
