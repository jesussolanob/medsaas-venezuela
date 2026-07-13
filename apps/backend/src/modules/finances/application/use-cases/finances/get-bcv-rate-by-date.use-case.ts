import { Inject, Injectable } from '@nestjs/common';
import {
  BCV_RATE_HISTORY_REPOSITORY,
  type IBcvRateHistoryRepository,
} from '../../../domain/repositories/bcv-rate-history.repository';
import {
  BCV_RATE_HISTORY_FETCHER,
  type IBcvRateHistoryFetcher,
} from '../../../domain/repositories/bcv-rate-history-fetcher.port';
import { BCV_RATE_FETCHER } from '../../../domain/repositories/rate-fetcher.ports';
import type { IBcvRateFetcher } from '../../../domain/repositories/rate-fetcher.ports';

export interface GetBcvRateByDateInput {
  /** ISO date string YYYY-MM-DD */
  date: string;
}

export interface GetBcvRateByDateOutput {
  /** null when all rate sources are unavailable — callers must handle this case */
  rate: number | null;
  date: string;
  /** Where the rate came from: 'cache' | 'pydolarve' | 'current-fallback' | 'unavailable' */
  source: string;
}

/** Maximum days back the historical API can supply (treat as unknown beyond this). */
const MAX_HISTORY_DAYS = 365;

/**
 * Returns the BCV USD/VES rate for a specific calendar date.
 *
 * Resolution order:
 *   1. Database cache (bcv_rate_history) — instant, no external call.
 *   2. Pydolarve historical API — fetched, persisted to cache, returned.
 *   3. Current BCV rate fallback — when history is unavailable.
 *   4. null ('unavailable') — all sources exhausted; callers must handle.
 *
 * NEVER throws due to external API failures.
 */
@Injectable()
export class GetBcvRateByDateUseCase {
  constructor(
    @Inject(BCV_RATE_HISTORY_REPOSITORY)
    private readonly historyRepo: IBcvRateHistoryRepository,
    @Inject(BCV_RATE_HISTORY_FETCHER)
    private readonly historyFetcher: IBcvRateHistoryFetcher,
    @Inject(BCV_RATE_FETCHER)
    private readonly currentFetcher: IBcvRateFetcher,
  ) {}

  async execute(input: GetBcvRateByDateInput): Promise<GetBcvRateByDateOutput> {
    const { date } = input;

    // Step 1 — Check the local cache.
    const cached = await this.historyRepo.findByDate(date);
    if (cached) {
      return { rate: cached.rate, date, source: 'cache' };
    }

    // Step 2 — Try the historical API (only for dates within the supported window).
    const requestedMs = new Date(date).getTime();
    const nowMs = Date.now();
    const daysDiff = (nowMs - requestedMs) / (1000 * 60 * 60 * 24);

    if (daysDiff >= 0 && daysDiff <= MAX_HISTORY_DAYS) {
      const historical = await this.historyFetcher.fetchForDate(date);
      if (historical !== null) {
        // Persist to cache so subsequent requests for the same date are instant.
        await this.historyRepo.save({ rateDate: date, rate: historical, source: 'pydolarve' });
        return { rate: historical, date, source: 'pydolarve' };
      }
    }

    // Step 3 — Fallback to the current BCV rate.
    const current = await this.currentFetcher.fetchRate();
    if (current !== null) {
      return { rate: current, date, source: 'current-fallback' };
    }

    // All sources exhausted — return null so callers can display an appropriate message
    // instead of silently using a corrupt rate (1 VES/USD).
    return { rate: null, date, source: 'unavailable' };
  }
}
