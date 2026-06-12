import { Inject, Injectable } from '@nestjs/common';
import {
  USDT_RATE_STORE,
  type IUsdtRateStore,
  type RateSource,
} from '../../../domain/repositories/usdt-rate.store';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import { InvalidRateSourceError } from '../../../domain/errors/invalid-rate-source.error';

export interface SetRateSourceInput {
  source: RateSource;
  /** Required when source === 'manual'; ignored otherwise. */
  value?: number;
}

export interface SetRateSourceOutput {
  source: RateSource;
  rate: number | null;
}

/**
 * Changes the active rate source (binance | bcv | manual).
 *
 * When switching to 'manual', `value` is required and must be > 0.
 * When switching to 'binance' or 'bcv', the store immediately fetches and
 * persists the new rate so it takes effect without waiting for the next
 * lazy read.
 */
@Injectable()
export class SetRateSourceUseCase {
  constructor(
    @Inject(USDT_RATE_STORE)
    private readonly rateStore: IUsdtRateStore,
  ) {}

  async execute(input: SetRateSourceInput): Promise<SetRateSourceOutput> {
    const { source, value } = input;

    if (source !== 'binance' && source !== 'bcv' && source !== 'manual') {
      throw new InvalidRateSourceError(source as string);
    }

    if (source === 'manual') {
      if (value == null || value <= 0) {
        throw new InvalidAmountError(value ?? 0);
      }
    }

    const rate = await this.rateStore.setSource(source, value);
    return { source, rate };
  }
}
