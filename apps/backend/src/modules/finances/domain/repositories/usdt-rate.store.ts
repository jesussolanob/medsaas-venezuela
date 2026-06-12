export const USDT_RATE_STORE = 'USDT_RATE_STORE';

/** The active source for the USDT/BS rate. */
export type RateSource = 'binance' | 'bcv' | 'manual';

/** Summary of all known rate values for the admin panel. */
export interface RatesSummary {
  source: RateSource;
  manual: number | null;
  binance: number | null;
  bcv: number | null;
  effective: number | null;
}

/**
 * Port for reading and writing the USDT/BS exchange rate.
 *
 * Implementations layer Redis cache over a persistent store (app_settings).
 * The domain layer depends only on this interface.
 *
 * === Rate source logic ===
 * app_settings key `rate_source` controls resolution:
 *   - 'manual'  → current behaviour (Redis usdt_rate → app_settings usdt_rate → null)
 *   - 'binance' → lazy-refresh via IBinanceRateFetcher (Redis hit first; miss → fetch → persist)
 *   - 'bcv'     → lazy-refresh via IBcvRateFetcher (same pattern)
 *
 * Additional persisted keys:
 *   - `usdt_rate`         → effective rate (always the source of truth)
 *   - `usdt_binance_rate` → last known Binance rate
 *   - `usdt_bcv_rate`     → last known BCV rate
 */
export interface IUsdtRateStore {
  /**
   * Returns the current rate (BS per USD).
   *
   * Resolution depends on `rate_source`:
   *   manual  → Redis `usdt_rate` → app_settings `usdt_rate` → null
   *   binance → Redis `usdt_rate` (hit) | fetch Binance (miss) → fallback last-good → null
   *   bcv     → Redis `usdt_rate` (hit) | fetch BCV (miss) → fallback last-good → null
   *
   * Returns null when no rate is available. NEVER throws.
   */
  getRate(): Promise<number | null>;

  /**
   * Persists the new rate as the effective rate (app_settings + Redis).
   * Also sets rate_source to 'manual'.
   * @param rate BS per USD (must be > 0)
   */
  setRate(rate: number): Promise<void>;

  /**
   * Changes the active rate source.
   * If switching to 'binance' or 'bcv', immediately fetches and persists
   * the rate from the corresponding fetcher so it takes effect right away.
   * Returns the effective rate after the switch (may be null if fetch failed
   * and no previous value exists).
   */
  setSource(source: RateSource, manualValue?: number): Promise<number | null>;

  /**
   * Returns a summary of all rate values for the admin panel.
   */
  getRatesSummary(): Promise<RatesSummary>;
}
