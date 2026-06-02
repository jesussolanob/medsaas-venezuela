import type { SubscriptionStatus, SubscriptionPlan } from '@delta/shared-types';

/**
 * Admin domain entity representing a doctor enriched with their subscription
 * and activity status.
 *
 * activityStatus derives from lastSignInAt. In Etapa 1, real login tracking
 * is not yet available (requires Auth0 integration — Fase 4). The repository
 * provides lastSignInAt as null until Fase 4 is implemented; all doctors
 * therefore appear as 'inactive' from an activity standpoint.
 */
export class DoctorWithActivity {
  constructor(
    public readonly id: string,
    public readonly fullName: string,
    public readonly email: string,
    public readonly specialty: string | null,
    public readonly subscriptionStatus: SubscriptionStatus,
    public readonly subscriptionPlan: SubscriptionPlan,
    public readonly subscriptionExpiresAt: Date | null,
    /**
     * Last sign-in timestamp from the auth provider.
     * Always null in Etapa 1 — real tracking added in Fase 4 (Auth0).
     * The repository may use profiles.updated_at as a proxy, but that
     * reflects profile updates, not actual logins.
     */
    public readonly lastSignInAt: Date | null,
  ) {}

  /**
   * Classifies the doctor's activity level based on days since last login.
   *
   * - active:   logged in within the last 7 days
   * - cold:     last login between 8 and 30 days ago
   * - inactive: last login more than 30 days ago, or no login record
   *
   * NOTE: In Etapa 1 this always returns 'inactive' because lastSignInAt
   * is null. Real activity classification will be accurate once Fase 4
   * (Auth0 login tracking) is in place.
   */
  get activityStatus(): 'active' | 'cold' | 'inactive' {
    if (!this.lastSignInAt) return 'inactive';
    const daysSinceLastLogin = Math.floor(
      (Date.now() - this.lastSignInAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceLastLogin <= 7) return 'active';
    if (daysSinceLastLogin <= 30) return 'cold';
    return 'inactive';
  }
}
