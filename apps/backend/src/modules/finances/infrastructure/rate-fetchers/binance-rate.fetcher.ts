import { Injectable, Logger } from '@nestjs/common';
import type { IBinanceRateFetcher } from '../../domain/repositories/rate-fetcher.ports';

/** Timeout for the Binance P2P request in milliseconds. */
const TIMEOUT_MS = 5_000;

interface BinanceAdv {
  price?: string;
}

interface BinanceAd {
  adv?: BinanceAdv;
}

interface BinanceP2PResponse {
  data?: BinanceAd[];
}

/**
 * Fetches the USDT/VES buy rate from Binance P2P.
 *
 * Posts to the Binance C2C search endpoint, retrieves the first 5 BUY ads
 * for USDT/VES, and returns the arithmetic average of their prices.
 * Returns null on any network error, timeout, parse failure, or when no
 * valid ads are found.
 *
 * NEVER throws — callers must not hard-fail if this returns null.
 */
@Injectable()
export class BinanceRateFetcher implements IBinanceRateFetcher {
  private readonly logger = new Logger(BinanceRateFetcher.name);

  async fetchRate(): Promise<number | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: 'USDT',
          fiat: 'VES',
          tradeType: 'BUY',
          page: 1,
          rows: 5,
          payTypes: [],
          countries: [],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`Binance P2P responded with HTTP ${response.status}`);
        return null;
      }

      const body = (await response.json()) as BinanceP2PResponse;

      const prices: number[] = (body.data ?? [])
        .map((ad) => parseFloat(ad.adv?.price ?? ''))
        .filter((n) => Number.isFinite(n) && n > 0);

      if (prices.length === 0) {
        this.logger.warn('Binance P2P returned no valid price ads');
        return null;
      }

      const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      return average;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`BinanceRateFetcher error: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
