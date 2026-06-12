import { Inject, Injectable } from '@nestjs/common';
import {
  USDT_RATE_STORE,
  type IUsdtRateStore,
  type RatesSummary,
} from '../../../domain/repositories/usdt-rate.store';

/**
 * Returns a summary of all known rate values for the admin panel.
 *
 * Fields:
 *   source    — currently active source ('binance' | 'bcv' | 'manual')
 *   manual    — last manually-set rate (non-null only when source='manual')
 *   binance   — last rate fetched from Binance P2P (may be null)
 *   bcv       — last rate fetched from BCV (may be null)
 *   effective — the actual rate currently in use (what getRate() would return from cache)
 */
@Injectable()
export class GetRatesSummaryUseCase {
  constructor(
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(): Promise<RatesSummary> {
    return this.rateStore.getRatesSummary();
  }
}
