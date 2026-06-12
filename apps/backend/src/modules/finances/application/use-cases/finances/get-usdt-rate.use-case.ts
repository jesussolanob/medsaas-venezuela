import { Inject, Injectable } from '@nestjs/common';
import { USDT_RATE_STORE, type IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';

export interface GetUsdtRateOutput {
  rate: number | null;
  /** Active rate source — informational, added additively. */
  source?: string;
}

/**
 * Returns the current USDT/BS exchange rate.
 *
 * The store's getRate() now performs lazy-refresh based on the configured
 * rate_source (binance | bcv | manual). This use case remains unchanged
 * in contract — it simply delegates and enriches with the source from the
 * rates summary.
 *
 * This use case is public — no authentication required.
 */
@Injectable()
export class GetUsdtRateUseCase {
  constructor(
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(): Promise<GetUsdtRateOutput> {
    const [rate, summary] = await Promise.all([
      this.rateStore.getRate(),
      this.rateStore.getRatesSummary(),
    ]);
    return { rate, source: summary.source };
  }
}
