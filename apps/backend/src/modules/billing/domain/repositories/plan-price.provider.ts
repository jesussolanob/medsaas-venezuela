/**
 * Domain port: IPlanPriceProvider
 *
 * Provides plan pricing information and platform payment instructions for
 * billing operations (checkout info, payment submission).
 *
 * This interface lives in the billing domain so that application use-cases
 * depend on an abstraction, not on the admin or finances infrastructure.
 *
 * The infrastructure implementation queries plan_configs + plan_prices (admin tables)
 * and app_settings (finances table) without creating cross-module use-case dependencies.
 */

export const PLAN_PRICE_PROVIDER = 'PLAN_PRICE_PROVIDER';

export interface PlanPriceInfo {
  planKey: string;
  planName: string;
  /** billing period — e.g. 'monthly' | 'quarterly' | 'semiannual' | 'annual' */
  period: string;
  /** Price in USD, as stored in plan_prices.price_usd (is_active = true). */
  priceUsd: number;
}

export interface IPlanPriceProvider {
  /**
   * Returns the active price for a given planKey + period combination.
   *
   * @throws PlanNotFoundForCheckoutError when the plan/period is not found,
   *   is inactive, or the planKey does not correspond to an active plan_config.
   */
  getActivePlanPrice(planKey: string, period: string): Promise<PlanPriceInfo>;

  /**
   * Returns the platform payment instructions from app_settings.
   * Falls back to an empty string if the key has not been seeded yet.
   * NEVER throws.
   */
  getPaymentInstructions(): Promise<string>;
}
