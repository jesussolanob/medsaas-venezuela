/**
 * Domain port: IPlatformRateProvider
 *
 * Provides the current BCV exchange rate (BS per USD) for platform billing
 * operations (checkout info, payment submission).
 *
 * This interface lives in the billing domain so that application use-cases
 * depend on an abstraction, not on the finances infrastructure.
 *
 * The infrastructure implementation reads the effective rate from
 * app_settings (the persistent source of truth that the finances module
 * always keeps up-to-date), avoiding a direct cross-module use-case import.
 */

export const PLATFORM_RATE_PROVIDER = 'PLATFORM_RATE_PROVIDER';

export interface RateResolution {
  /** Exchange rate in bolivars per USD. Never 0 or NaN. */
  rate: number;
  /** ISO date string (YYYY-MM-DD) of when the rate was last updated. */
  rateDate: string;
}

export interface IPlatformRateProvider {
  /**
   * Returns the current effective exchange rate for billing calculations.
   *
   * Resolution order:
   *   1. app_settings['usdt_rate']         — effective rate (all sources write here)
   *   2. app_settings['usdt_bcv_rate']      — last known BCV-specific rate
   *
   * @throws RateUnavailableError when no rate can be resolved.
   * NEVER returns 0 or NaN.
   */
  getEffectiveRate(): Promise<RateResolution>;
}
