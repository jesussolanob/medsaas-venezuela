export const USDT_RATE_STORE = 'USDT_RATE_STORE';

/**
 * Port for reading and writing the USDT/BS exchange rate.
 *
 * Implementations may layer Redis cache over a persistent store (app_settings).
 * The domain layer depends only on this interface.
 */
export interface IUsdtRateStore {
  /**
   * Returns the current rate (BS per USD).
   * Reads from Redis first (TTL 600 s); falls back to app_settings if not cached.
   * Returns null when no rate has been configured yet.
   */
  getRate(): Promise<number | null>;

  /**
   * Persists the new rate to app_settings and updates the Redis cache.
   * @param rate BS per USD (must be > 0)
   */
  setRate(rate: number): Promise<void>;
}
