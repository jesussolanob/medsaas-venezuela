import { GetFinancialSummaryUseCase } from './get-financial-summary.use-case';
import type { IFinanceRepository } from '../../../domain/repositories/finance.repository';
import type { IUsdtRateStore } from '../../../domain/repositories/usdt-rate.store';

describe('GetFinancialSummaryUseCase', () => {
  let useCase: GetFinancialSummaryUseCase;
  let mockRepo: jest.Mocked<IFinanceRepository>;
  let mockRateStore: jest.Mocked<IUsdtRateStore>;

  const defaultConsultationSummary = {
    approvedTotal: 300,
    approvedCount: 3,
    pendingTotal: 100,
  };

  const defaultManualIncome = { total: 50, count: 1 };
  const defaultExpenses = { total: 80, count: 2 };

  const defaultIncomeBreakdown = {
    consultationsApproved: 300,
    consultationsPending: 100,
    manualIncome: 50,
  };

  const defaultExpenseBreakdown = {
    rent: 40,
    staff: 0,
    supplies: 20,
    services: 20,
    taxes: 0,
    other: 0,
  };

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      getConsultationSummary: jest.fn().mockResolvedValue(defaultConsultationSummary),
      sumManualIncome: jest.fn().mockResolvedValue(defaultManualIncome),
      sumExpenses: jest.fn().mockResolvedValue(defaultExpenses),
      delete: jest.fn(),
      lifetimeIncome: jest.fn(),
      updateTransaction: jest.fn(),
      listIncomeTransactions: jest.fn(),
      listIncomePaginated: jest.fn(),
      getIncomeBreakdown: jest.fn().mockResolvedValue(defaultIncomeBreakdown),
      getExpenseBreakdown: jest.fn().mockResolvedValue(defaultExpenseBreakdown),
    };
    mockRateStore = {
      getRate: jest.fn().mockResolvedValue(36),
      setRate: jest.fn(),
      setSource: jest.fn(),
      getRatesSummary: jest.fn(),
    } as unknown as jest.Mocked<IUsdtRateStore>;
    useCase = new GetFinancialSummaryUseCase(mockRepo, mockRateStore);
  });

  it('calculates total income as approved consultations + manual income', async () => {
    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
    // 300 (approved) + 50 (manual) = 350
    expect(result.totalIncome).toBe(350);
  });

  it('calculates total expenses correctly', async () => {
    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
    expect(result.totalExpenses).toBe(80);
  });

  it('calculates net income after expenses', async () => {
    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
    // 350 - 80 = 270
    expect(result.net).toBe(270);
  });

  it('converts net to BS using the USDT rate', async () => {
    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
    // 270 * 36 = 9720
    expect(result.netBS).toBe(9720);
    expect(result.rateUsed).toBe(36);
  });

  it('returns netBS as null when no rate is configured', async () => {
    mockRateStore.getRate.mockResolvedValue(null);
    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
    expect(result.netBS).toBeNull();
    expect(result.rateUsed).toBeNull();
  });

  it('returns zero values for an empty month', async () => {
    mockRepo.getConsultationSummary.mockResolvedValue({
      approvedTotal: 0,
      approvedCount: 0,
      pendingTotal: 0,
    });
    mockRepo.sumManualIncome.mockResolvedValue({ total: 0, count: 0 });
    mockRepo.sumExpenses.mockResolvedValue({ total: 0, count: 0 });

    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });

    expect(result.totalIncome).toBe(0);
    expect(result.totalExpenses).toBe(0);
    expect(result.net).toBe(0);
    expect(result.consultationCount).toBe(0);
    expect(result.pendingAmount).toBe(0);
  });

  it('only counts approved payments for totalIncome', async () => {
    mockRepo.getConsultationSummary.mockResolvedValue({
      approvedTotal: 200,
      approvedCount: 2,
      pendingTotal: 500, // pending is NOT counted in income
    });
    mockRepo.sumManualIncome.mockResolvedValue({ total: 0, count: 0 });
    mockRepo.sumExpenses.mockResolvedValue({ total: 0, count: 0 });

    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });

    expect(result.totalIncome).toBe(200);
    expect(result.pendingAmount).toBe(500);
  });

  it('returns NEGATIVE net when expenses exceed income (deficit month)', async () => {
    mockRepo.getConsultationSummary.mockResolvedValue({
      approvedTotal: 10,
      approvedCount: 1,
      pendingTotal: 0,
    });
    mockRepo.sumManualIncome.mockResolvedValue({ total: 0, count: 0 });
    mockRepo.sumExpenses.mockResolvedValue({ total: 500, count: 5 });

    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });

    // 10 - 500 = -490 (real deficit, not floored at 0)
    expect(result.net).toBe(-490);
    expect(result.totalIncome).toBe(10);
    expect(result.totalExpenses).toBe(500);
  });

  it('returns negative netBS when month is in deficit', async () => {
    mockRepo.getConsultationSummary.mockResolvedValue({
      approvedTotal: 10,
      approvedCount: 1,
      pendingTotal: 0,
    });
    mockRepo.sumManualIncome.mockResolvedValue({ total: 0, count: 0 });
    mockRepo.sumExpenses.mockResolvedValue({ total: 110, count: 2 });
    mockRateStore.getRate.mockResolvedValue(10);

    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });

    // net = 10 - 110 = -100; netBS = -100 * 10 = -1000
    expect(result.net).toBe(-100);
    expect(result.netBS).toBe(-1000);
  });

  it('defaults to the current month when month is not provided', async () => {
    const result = await useCase.execute({ doctorId: 'doc-id-1' });
    const now = new Date();
    const expectedMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(result.month).toBe(expectedMonth);
  });

  it('carries the correct consultation count', async () => {
    const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
    expect(result.consultationCount).toBe(3);
  });

  it('fetches all data in parallel (all mocks called once)', async () => {
    await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
    expect(mockRepo.getConsultationSummary).toHaveBeenCalledTimes(1);
    expect(mockRepo.sumManualIncome).toHaveBeenCalledTimes(1);
    expect(mockRepo.sumExpenses).toHaveBeenCalledTimes(1);
    expect(mockRateStore.getRate).toHaveBeenCalledTimes(1);
    expect(mockRepo.getIncomeBreakdown).toHaveBeenCalledTimes(1);
    expect(mockRepo.getExpenseBreakdown).toHaveBeenCalledTimes(1);
  });

  describe('incomeBreakdown', () => {
    it('returns the income breakdown from the repository', async () => {
      const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
      expect(result.incomeBreakdown).toEqual({
        consultationsApproved: 300,
        consultationsPending: 100,
        manualIncome: 50,
      });
    });

    it('passes doctorId and month to getIncomeBreakdown', async () => {
      await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
      expect(mockRepo.getIncomeBreakdown).toHaveBeenCalledWith('doc-id-1', '2026-06');
    });

    it('returns zero breakdown for an empty month', async () => {
      const emptyBreakdown = { consultationsApproved: 0, consultationsPending: 0, manualIncome: 0 };
      mockRepo.getIncomeBreakdown.mockResolvedValue(emptyBreakdown);

      const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-01' });
      expect(result.incomeBreakdown.consultationsApproved).toBe(0);
      expect(result.incomeBreakdown.manualIncome).toBe(0);
    });
  });

  describe('expenseBreakdown', () => {
    it('returns the expense breakdown from the repository', async () => {
      const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
      expect(result.expenseBreakdown).toEqual({
        rent: 40,
        staff: 0,
        supplies: 20,
        services: 20,
        taxes: 0,
        other: 0,
      });
    });

    it('passes doctorId and month to getExpenseBreakdown', async () => {
      await useCase.execute({ doctorId: 'doc-id-1', month: '2026-06' });
      expect(mockRepo.getExpenseBreakdown).toHaveBeenCalledWith('doc-id-1', '2026-06');
    });

    it('returns all six zero keys for an empty expense month', async () => {
      const emptyBreakdown = {
        rent: 0,
        staff: 0,
        supplies: 0,
        services: 0,
        taxes: 0,
        other: 0,
      };
      mockRepo.getExpenseBreakdown.mockResolvedValue(emptyBreakdown);

      const result = await useCase.execute({ doctorId: 'doc-id-1', month: '2026-01' });
      expect(Object.keys(result.expenseBreakdown)).toHaveLength(6);
      expect(result.expenseBreakdown.rent).toBe(0);
      expect(result.expenseBreakdown.other).toBe(0);
    });
  });
});
