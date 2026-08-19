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

/** Estado de encendido de la cuenta, para decidir si corresponde reactivarla. */
export interface LoginTouchAccountState {
  isActive: boolean;
  /** 'self' = se dio de baja el propio especialista · 'admin' = lo bloquearon. */
  deactivatedBy: string | null;
}

export interface ILoginTouchRepository {
  /**
   * Estado de encendido del perfil. Null si el perfil no existe.
   */
  findAccountState(profileId: string): Promise<LoginTouchAccountState | null>;

  /**
   * Vuelve a encender una cuenta que su propio dueño había dado de baja,
   * tocando además last_sign_in_at.
   *
   * CONSERVA el plan si todavía no venció (`subscription_expires_at > now`);
   * recién cuando venció cae al plan gratuito permanente. Antes caía SIEMPRE
   * al gratuito, así que un especialista con días de prueba por delante que
   * se daba de baja y volvía a entrar perdía esos días y se encontraba con
   * los módulos bloqueados — mientras el panel de admin seguía mostrando
   * "Free Trial", porque leía la tabla `subscriptions` que nadie sincronizaba.
   *
   * Escribe `profiles` Y `subscriptions` en la misma transacción, y deja
   * asiento en `subscription_changes_log`.
   *
   * NO toca las cuentas bloqueadas por un admin: esa condición la evalúa el
   * caso de uso antes de llamar acá.
   */
  reactivateAndTouch(profileId: string, freePlanKey: string): Promise<void>;
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
