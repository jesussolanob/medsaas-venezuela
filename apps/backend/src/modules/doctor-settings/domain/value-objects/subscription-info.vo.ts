/**
 * SubscriptionInfo value object.
 *
 * Wraps a doctor's subscription state and computes UI-facing banner level.
 * No external dependencies — pure domain logic.
 */

export type SubscriptionStatus = 'active' | 'suspended' | 'cancelled' | 'trial' | 'past_due';
export type BannerLevel = 'none' | 'warning' | 'critical' | 'suspended';

export interface SubscriptionInfoParams {
  status: SubscriptionStatus;
  plan: string;
  expiresAt: Date | null;
}

export class SubscriptionInfo {
  readonly status: SubscriptionStatus;
  readonly plan: string;
  readonly expiresAt: Date | null;

  constructor(params: SubscriptionInfoParams) {
    this.status = params.status;
    this.plan = params.plan;
    this.expiresAt = params.expiresAt;
  }

  /**
   * Days remaining until subscription expiry.
   * Returns null when expiresAt is not set or the subscription has already expired.
   */
  get daysUntilExpiry(): number | null {
    if (!this.expiresAt) return null;
    const now = Date.now();
    const expMs = this.expiresAt.getTime();
    const diffMs = expMs - now;
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Banner level to display in the UI.
   *
   * suspended → always show suspended banner (regardless of expiry)
   * critical  → ≤ 3 days until expiry
   * warning   → ≤ 7 days until expiry
   * none      → > 7 days remaining or no expiry set
   */
  get bannerLevel(): BannerLevel {
    if (this.status === 'suspended') return 'suspended';

    const days = this.daysUntilExpiry;
    if (days === null) return 'none';
    if (days <= 3) return 'critical';
    if (days <= 7) return 'warning';
    return 'none';
  }

  static create(params: SubscriptionInfoParams): SubscriptionInfo {
    return new SubscriptionInfo(params);
  }
}
