/**
 * ISubscriptionPanelRepository — interface for the full subscription panel data.
 *
 * This repository aggregates data from multiple tables:
 *   - subscriptions        (doctor's current plan + status + expiry)
 *   - plan_configs         (plan human-readable name + base price)
 *   - plan_prices          (duration-based pricing options)
 *   - plan_promotions      (active promotions for the current plan)
 *   - subscription_payments (doctor's payment history)
 *   - app_settings         (platform payment methods config)
 *
 * Domain layer — no NestJS, Sequelize, or external imports.
 */

export const SUBSCRIPTION_PANEL_REPOSITORY = Symbol('ISubscriptionPanelRepository');

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export interface DurationOption {
  durationMonths: number;
  basePriceUsd: number;
  finalPriceUsd: number;
  discountPct: number;
  promotionId: string | null;
  label: string | null;
}

export interface PaymentHistoryItem {
  id: string;
  amountUsd: number;
  durationMonths: number;
  method: string;
  referenceNumber: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  rejectionReason: string | null;
}

export interface SubscriptionPanelData {
  /** Doctor's current plan key (e.g. "trial", "basic"). */
  planKey: string;
  /** Human-readable plan name from plan_configs. */
  planName: string;
  /** Subscription status from the subscriptions table. */
  status: string;
  /** ISO date string (or null if no expiry). */
  expiresAt: string | null;
  /** Calendar days remaining until expiry (0 if expired, 0 if no expiry). */
  daysRemaining: number;
  /** True when current datetime > expiresAt. */
  isExpired: boolean;
  /** True when plan is permanent (e.g. delta_free). */
  isPermanent: boolean;
  /** True when status === 'trial' AND the plan is not permanent. */
  isInTrial: boolean;
  /** Base monthly price from plan_configs (USD). */
  basePriceUsd: number;
  /** Currency string (always 'USD' for now). */
  currency: string;
  /** Duration options combining plan_prices + active promotions. */
  durationOptions: DurationOption[];
  /** Platform payment methods enabled from app_settings. */
  paymentMethodsEnabled: string[];
  /** Payment config per method (bank data, phone, etc.) from app_settings. */
  paymentMethodsConfig: Record<string, Record<string, string>>;
  /** Whether Stripe is enabled. Always false in Etapa 1. */
  stripeEnabled: boolean;
  /** Payment history from subscription_payments, most recent first. */
  payments: PaymentHistoryItem[];
}

// ---------------------------------------------------------------------------
// Repository interface
// ---------------------------------------------------------------------------

export interface ISubscriptionPanelRepository {
  /**
   * Returns the full subscription panel data for the given doctor.
   *
   * When no subscription row exists, returns a synthetic default using the
   * profiles snapshot (plan + subscription_status + subscription_expires_at)
   * instead of throwing an error — so the panel always loads.
   */
  findPanelData(doctorId: string): Promise<SubscriptionPanelData>;
}
