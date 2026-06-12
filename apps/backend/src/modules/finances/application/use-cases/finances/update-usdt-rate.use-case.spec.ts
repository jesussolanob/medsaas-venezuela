import { UpdateUsdtRateUseCase } from './update-usdt-rate.use-case';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import type { IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';

describe('UpdateUsdtRateUseCase', () => {
  let useCase: UpdateUsdtRateUseCase;
  let mockStore: jest.Mocked<IUsdtRateStore>;

  beforeEach(() => {
    mockStore = {
      getRate: jest.fn(),
      setRate: jest.fn().mockResolvedValue(undefined),
      setSource: jest.fn(),
      getRatesSummary: jest.fn(),
    } as unknown as jest.Mocked<IUsdtRateStore>;
    useCase = new UpdateUsdtRateUseCase(mockStore);
  });

  it('updates the rate and returns it', async () => {
    const result = await useCase.execute({ rate: 36.5 });
    expect(result.rate).toBe(36.5);
    expect(mockStore.setRate).toHaveBeenCalledWith(36.5);
  });

  it('throws InvalidAmountError for rate === 0', async () => {
    await expect(useCase.execute({ rate: 0 })).rejects.toThrow(InvalidAmountError);
    expect(mockStore.setRate).not.toHaveBeenCalled();
  });

  it('throws InvalidAmountError for negative rate', async () => {
    await expect(useCase.execute({ rate: -5 })).rejects.toThrow(InvalidAmountError);
    expect(mockStore.setRate).not.toHaveBeenCalled();
  });

  it('calls setRate exactly once with the exact value', async () => {
    await useCase.execute({ rate: 40 });
    expect(mockStore.setRate).toHaveBeenCalledTimes(1);
    expect(mockStore.setRate).toHaveBeenCalledWith(40);
  });

  it('accepts fractional rates', async () => {
    const result = await useCase.execute({ rate: 36.75 });
    expect(result.rate).toBe(36.75);
    expect(mockStore.setRate).toHaveBeenCalledWith(36.75);
  });
});
