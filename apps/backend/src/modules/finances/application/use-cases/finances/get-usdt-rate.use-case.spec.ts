import { GetUsdtRateUseCase } from './get-usdt-rate.use-case';
import type { IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';

describe('GetUsdtRateUseCase', () => {
  let useCase: GetUsdtRateUseCase;
  let mockStore: jest.Mocked<IUsdtRateStore>;

  beforeEach(() => {
    mockStore = {
      getRate: jest.fn(),
      setRate: jest.fn(),
    };
    useCase = new GetUsdtRateUseCase(mockStore);
  });

  it('returns the current rate from the store', async () => {
    mockStore.getRate.mockResolvedValue(36.5);
    const result = await useCase.execute();
    expect(result.rate).toBe(36.5);
  });

  it('returns null when no rate has been configured', async () => {
    mockStore.getRate.mockResolvedValue(null);
    const result = await useCase.execute();
    expect(result.rate).toBeNull();
  });

  it('delegates entirely to the rate store', async () => {
    mockStore.getRate.mockResolvedValue(40);
    await useCase.execute();
    expect(mockStore.getRate).toHaveBeenCalledTimes(1);
  });
});
