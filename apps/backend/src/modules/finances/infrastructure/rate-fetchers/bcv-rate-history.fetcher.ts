import { Injectable, Logger } from '@nestjs/common';

/** Timeout for external HTTP requests in milliseconds. */
const TIMEOUT_MS = 5_000;

/** Shape returned by pydolarve history endpoint. */
interface PydolarveDateRecord {
  price?: number;
  last_update?: string;
}

interface PydolarveHistoryResponse {
  date?: PydolarveDateRecord;
  [key: string]: unknown;
}

/**
 * Fetches a historical BCV USD/VES rate for a specific date.
 *
 * API: GET https://pydolarve.org/api/v1/dollar/history?page=bcv
 *          &start_date=DD-MM-YYYY&end_date=DD-MM-YYYY&format=json
 *
 * Returns null on any network error, timeout, or unparseable response.
 * NEVER throws — callers treat null as a soft miss and fall back gracefully.
 */
@Injectable()
export class BcvRateHistoryFetcher {
  private readonly logger = new Logger(BcvRateHistoryFetcher.name);

  /**
   * Fetches the BCV rate for a given ISO date (YYYY-MM-DD).
   * Returns null if the rate is unavailable.
   */
  async fetchForDate(isoDate: string): Promise<number | null> {
    const ddmmyyyy = this.isoToDdMmYyyy(isoDate);
    const url = `https://pydolarve.org/api/v1/dollar/history?page=bcv&start_date=${ddmmyyyy}&end_date=${ddmmyyyy}&format=json`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        this.logger.warn(`pydolarve history responded with HTTP ${response.status} for ${isoDate}`);
        return null;
      }

      const body = (await response.json()) as PydolarveHistoryResponse;

      // The API returns a "date" key with the rate data when a record exists.
      const record = body.date;
      if (!record) {
        this.logger.warn(`pydolarve history: no 'date' key in response for ${isoDate}`);
        return null;
      }

      const value = record.price;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        this.logger.warn(`pydolarve history: invalid price for ${isoDate}: ${String(value)}`);
        return null;
      }

      return value;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`BcvRateHistoryFetcher error for ${isoDate}: ${message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Converts YYYY-MM-DD → DD-MM-YYYY as required by the pydolarve API. */
  private isoToDdMmYyyy(isoDate: string): string {
    const [yyyy, mm, dd] = isoDate.split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
}
