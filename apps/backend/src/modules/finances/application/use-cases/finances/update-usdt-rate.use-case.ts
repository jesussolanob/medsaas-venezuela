import { Inject, Injectable } from '@nestjs/common';
import { USDT_RATE_STORE, type IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';

export interface UpdateUsdtRateInput {
  rate: number;
}

export interface UpdateUsdtRateOutput {
  rate: number;
}

/**
 * Updates the USDT/BS exchange rate.
 *
 * Write path: persists to app_settings, then warms the Redis cache.
 *
 * Authorization is enforced exclusively at the HTTP layer via
 * RolesGuard + @Roles('super_admin') on AdminSettingsController.
 * The use case does not duplicate that check — it trusts the guard.
 */
@Injectable()
export class UpdateUsdtRateUseCase {
  constructor(
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(input: UpdateUsdtRateInput): Promise<UpdateUsdtRateOutput> {
    if (input.rate <= 0) {
      throw new InvalidAmountError(input.rate);
    }

    await this.rateStore.setRate(input.rate);
    return { rate: input.rate };
  }
}
