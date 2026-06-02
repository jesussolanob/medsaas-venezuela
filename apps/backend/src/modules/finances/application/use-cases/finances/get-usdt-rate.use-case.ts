import { Inject, Injectable } from '@nestjs/common';
import { USDT_RATE_STORE, type IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';

export interface GetUsdtRateOutput {
  rate: number | null;
}

/**
 * Returns the current USDT/BS exchange rate.
 *
 * Read path: Redis (TTL 600 s) → app_settings → null.
 * This use case is public — no authentication required.
 */
@Injectable()
export class GetUsdtRateUseCase {
  constructor(
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(): Promise<GetUsdtRateOutput> {
    const rate = await this.rateStore.getRate();
    return { rate };
  }
}
