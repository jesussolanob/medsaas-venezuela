import { GetLifetimeIncomeUseCase } from './get-lifetime-income.use-case';
import type { IFinanceRepository } from '../../../domain/repositories/finance.repository';
import type { IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';

const DOCTOR_ID = 'd0c70000-0000-0000-0000-000000000001';

describe('GetLifetimeIncomeUseCase', () => {
  let useCase: GetLifetimeIncomeUseCase;
  let mockRepo: jest.Mocked<IFinanceRepository>;
  let mockRateStore: jest.Mocked<IUsdtRateStore>;

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      getConsultationSummary: jest.fn(),
      sumManualIncome: jest.fn(),
      sumExpenses: jest.fn(),
      delete: jest.fn(),
      lifetimeIncome: jest.fn(),
      updateTransaction: jest.fn(),
    };
    mockRateStore = {
      getRate: jest.fn(),
      setRate: jest.fn(),
      setSource: jest.fn(),
      getRatesSummary: jest.fn(),
    } as unknown as jest.Mocked<IUsdtRateStore>;
    useCase = new GetLifetimeIncomeUseCase(mockRepo, mockRateStore);
  });

  it('returns total income with BS conversion when rate is available', async () => {
    mockRepo.lifetimeIncome.mockResolvedValue({ total: 1000, consultationCount: 20 });
    mockRateStore.getRate.mockResolvedValue(36.5);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.totalUsd).toBe(1000);
    expect(result.totalBs).toBe(36500);
    expect(result.consultationCount).toBe(20);
    expect(result.rateUsed).toBe(36.5);
  });

  it('returns null totalBs when no rate is configured', async () => {
    mockRepo.lifetimeIncome.mockResolvedValue({ total: 500, consultationCount: 10 });
    mockRateStore.getRate.mockResolvedValue(null);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.totalUsd).toBe(500);
    expect(result.totalBs).toBeNull();
    expect(result.rateUsed).toBeNull();
  });

  it('calls repo and rate store in parallel', async () => {
    mockRepo.lifetimeIncome.mockResolvedValue({ total: 0, consultationCount: 0 });
    mockRateStore.getRate.mockResolvedValue(null);

    await useCase.execute(DOCTOR_ID);

    expect(mockRepo.lifetimeIncome).toHaveBeenCalledWith(DOCTOR_ID);
    expect(mockRateStore.getRate).toHaveBeenCalled();
  });
});
