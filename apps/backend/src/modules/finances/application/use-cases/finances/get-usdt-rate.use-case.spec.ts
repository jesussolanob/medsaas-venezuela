import { GetUsdtRateUseCase } from './get-usdt-rate.use-case';
import type { IUsdtRateStore, RatesSummary } from '../../../domain/repositories/usdt-rate.store';

function makeStore(rate: number | null, source = 'binance'): jest.Mocked<IUsdtRateStore> {
  const summary: RatesSummary = {
    source: source as 'binance' | 'bcv' | 'manual',
    manual: source === 'manual' ? rate : null,
    binance: source === 'binance' ? rate : null,
    bcv: source === 'bcv' ? rate : null,
    effective: rate,
  };
  return {
    getRate: jest.fn().mockResolvedValue(rate),
    setRate: jest.fn(),
    setSource: jest.fn(),
    getRatesSummary: jest.fn().mockResolvedValue(summary),
  };
}

describe('GetUsdtRateUseCase', () => {
  it('returns the current rate from the store', async () => {
    const useCase = new GetUsdtRateUseCase(makeStore(36.5));
    const result = await useCase.execute();
    expect(result.rate).toBe(36.5);
  });

  it('returns null when no rate has been configured', async () => {
    const useCase = new GetUsdtRateUseCase(makeStore(null));
    const result = await useCase.execute();
    expect(result.rate).toBeNull();
  });

  it('delegates entirely to the rate store', async () => {
    const store = makeStore(40);
    const useCase = new GetUsdtRateUseCase(store);
    await useCase.execute();
    expect(store.getRate).toHaveBeenCalledTimes(1);
  });

  it('includes the active source in the response', async () => {
    const useCase = new GetUsdtRateUseCase(makeStore(36.5, 'bcv'));
    const result = await useCase.execute();
    expect(result.source).toBe('bcv');
  });

  it('returns source=binance for binance-sourced rate', async () => {
    const useCase = new GetUsdtRateUseCase(makeStore(40.0, 'binance'));
    const result = await useCase.execute();
    expect(result.source).toBe('binance');
  });

  it('returns source=manual for manual rate', async () => {
    const useCase = new GetUsdtRateUseCase(makeStore(55.0, 'manual'));
    const result = await useCase.execute();
    expect(result.source).toBe('manual');
  });
});
