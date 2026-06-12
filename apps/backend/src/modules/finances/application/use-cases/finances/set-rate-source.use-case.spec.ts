import { SetRateSourceUseCase } from './set-rate-source.use-case';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import { InvalidRateSourceError } from '../../../domain/errors/invalid-rate-source.error';
import type { IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';

function makeStore(setSourceResult: number | null = 40.0): jest.Mocked<IUsdtRateStore> {
  return {
    getRate: jest.fn(),
    setRate: jest.fn(),
    setSource: jest.fn().mockResolvedValue(setSourceResult),
    getRatesSummary: jest.fn(),
  };
}

describe('SetRateSourceUseCase', () => {
  it('switches to binance and returns the fetched rate', async () => {
    const store = makeStore(41.0);
    const useCase = new SetRateSourceUseCase(store);

    const result = await useCase.execute({ source: 'binance' });

    expect(result.source).toBe('binance');
    expect(result.rate).toBe(41.0);
    expect(store.setSource).toHaveBeenCalledWith('binance', undefined);
  });

  it('switches to bcv and returns the fetched rate', async () => {
    const store = makeStore(38.5);
    const useCase = new SetRateSourceUseCase(store);

    const result = await useCase.execute({ source: 'bcv' });

    expect(result.source).toBe('bcv');
    expect(result.rate).toBe(38.5);
    expect(store.setSource).toHaveBeenCalledWith('bcv', undefined);
  });

  it('switches to manual with provided value', async () => {
    const store = makeStore(50.0);
    const useCase = new SetRateSourceUseCase(store);

    const result = await useCase.execute({ source: 'manual', value: 50.0 });

    expect(result.source).toBe('manual');
    expect(result.rate).toBe(50.0);
    expect(store.setSource).toHaveBeenCalledWith('manual', 50.0);
  });

  it('throws InvalidAmountError when source=manual and value is missing', async () => {
    const store = makeStore();
    const useCase = new SetRateSourceUseCase(store);

    await expect(useCase.execute({ source: 'manual' })).rejects.toThrow(InvalidAmountError);
    expect(store.setSource).not.toHaveBeenCalled();
  });

  it('throws InvalidAmountError when source=manual and value <= 0', async () => {
    const store = makeStore();
    const useCase = new SetRateSourceUseCase(store);

    await expect(useCase.execute({ source: 'manual', value: 0 })).rejects.toThrow(
      InvalidAmountError,
    );
    await expect(useCase.execute({ source: 'manual', value: -5 })).rejects.toThrow(
      InvalidAmountError,
    );
  });

  it('throws InvalidRateSourceError for unknown source', async () => {
    const store = makeStore();
    const useCase = new SetRateSourceUseCase(store);

    await expect(useCase.execute({ source: 'unknown' as 'binance' })).rejects.toThrow(
      InvalidRateSourceError,
    );
  });

  it('returns null rate when fetch fails after switching source', async () => {
    const store = makeStore(null);
    const useCase = new SetRateSourceUseCase(store);

    const result = await useCase.execute({ source: 'binance' });

    expect(result.rate).toBeNull();
    expect(result.source).toBe('binance');
  });
});
