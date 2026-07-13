/**
 * Domain port: historical BCV USD/VES rate fetcher.
 *
 * Defined in domain/ — no external dependencies.
 * Infrastructure provides the concrete implementation (BcvRateHistoryFetcher).
 */

export const BCV_RATE_HISTORY_FETCHER = 'BCV_RATE_HISTORY_FETCHER';

/**
 * Fetches the historical BCV USD/VES rate for a specific calendar date.
 * Returns null if the rate is unavailable for any reason.
 * NEVER throws — callers treat null as a soft miss.
 */
export interface IBcvRateHistoryFetcher {
  fetchForDate(isoDate: string): Promise<number | null>;
}
