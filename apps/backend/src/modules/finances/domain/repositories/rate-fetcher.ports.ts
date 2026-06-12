/**
 * Domain ports for external rate fetchers.
 *
 * These interfaces live in domain/ and have no external dependencies.
 * Infrastructure provides concrete implementations; tests inject fakes.
 */

export const BINANCE_RATE_FETCHER = 'BINANCE_RATE_FETCHER';
export const BCV_RATE_FETCHER = 'BCV_RATE_FETCHER';

/**
 * Fetches the current USDT/VES buy rate from Binance P2P.
 * Returns the averaged price from the top-5 ads, or null on any error.
 */
export interface IBinanceRateFetcher {
  fetchRate(): Promise<number | null>;
}

/**
 * Fetches the current USD/VES official rate from the BCV (via proxy).
 * Returns the rate or null on any error.
 */
export interface IBcvRateFetcher {
  fetchRate(): Promise<number | null>;
}
