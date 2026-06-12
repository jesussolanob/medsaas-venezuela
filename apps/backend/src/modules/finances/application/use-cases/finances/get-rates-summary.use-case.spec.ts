import { GetRatesSummaryUseCase } from './get-rates-summary.use-case';
import type { IUsdtRateStore, RatesSummary } from '../../../domain/repositories/usdt-rate.store';

function makeStore(summary: RatesSummary): jest.Mocked<IUsdtRateStore> {
  return {
    getRate: jest.fn(),
    setRate: jest.fn(),
    setSource: jest.fn(),
    getRatesSummary: jest.fn().mockResolvedValue(summary),
  };
}

const defaultSummary: RatesSummary = {
  source: 'binance',
  manual: null,
  binance: 40.0,
  bcv: 38.5,
  effective: 40.0,
};

describe('GetRatesSummaryUseCase', () => {
  it('delegates to the store and returns its summary', async () => {
    const store = makeStore(defaultSummary);
    const useCase = new GetRatesSummaryUseCase(store);

    const result = await useCase.execute();

    expect(result).toEqual(defaultSummary);
    expect(store.getRatesSummary).toHaveBeenCalledTimes(1);
  });

  it('returns source=manual with manual rate populated', async () => {
    const summary: RatesSummary = {
      source: 'manual',
      manual: 55.0,
      binance: null,
      bcv: null,
      effective: 55.0,
    };
    const store = makeStore(summary);
    const useCase = new GetRatesSummaryUseCase(store);

    const result = await useCase.execute();

    expect(result.source).toBe('manual');
    expect(result.manual).toBe(55.0);
    expect(result.effective).toBe(55.0);
  });

  it('returns null fields when no rates are configured', async () => {
    const summary: RatesSummary = {
      source: 'binance',
      manual: null,
      binance: null,
      bcv: null,
      effective: null,
    };
    const store = makeStore(summary);
    const useCase = new GetRatesSummaryUseCase(store);

    const result = await useCase.execute();

    expect(result.binance).toBeNull();
    expect(result.bcv).toBeNull();
    expect(result.effective).toBeNull();
  });
});
