import { Injectable, Logger } from '@nestjs/common';
import type { IBcvRateFetcher } from '../../domain/repositories/rate-fetcher.ports';

/** Timeout for each HTTP request in milliseconds. */
const TIMEOUT_MS = 5_000;

interface DolarApiResponse {
  promedio?: number;
}

interface PydolarResponse {
  price?: number;
}

/**
 * Fetches the USD/VES official (BCV) rate.
 *
 * Primary: GET https://ve.dolarapi.com/v1/dolares/oficial — uses `promedio` field.
 * Fallback: GET https://pydolarve.org/api/v2/dollar?page=bcv — uses `price` field.
 *
 * Returns null on any network error, timeout, or unparseable response.
 * NEVER throws — callers treat null as a soft miss.
 */
@Injectable()
export class BcvRateFetcher implements IBcvRateFetcher {
  private readonly logger = new Logger(BcvRateFetcher.name);

  async fetchRate(): Promise<number | null> {
    const primary = await this.fetchPrimary();
    if (primary !== null) return primary;

    this.logger.warn('BCV primary source failed; trying fallback');
    return this.fetchFallback();
  }

  private async fetchPrimary(): Promise<number | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`ve.dolarapi.com responded with HTTP ${response.status}`);
        return null;
      }

      const body = (await response.json()) as DolarApiResponse;
      const value = body.promedio;

      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        this.logger.warn(`ve.dolarapi.com returned invalid promedio: ${String(value)}`);
        return null;
      }

      return value;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`BcvRateFetcher primary error: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchFallback(): Promise<number | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv', {
        signal: controller.signal,
      });

      if (!response.ok) {
        this.logger.warn(`pydolarve.org responded with HTTP ${response.status}`);
        return null;
      }

      const body = (await response.json()) as PydolarResponse;
      const value = body.price;

      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        this.logger.warn(`pydolarve.org returned invalid price: ${String(value)}`);
        return null;
      }

      return value;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`BcvRateFetcher fallback error: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
