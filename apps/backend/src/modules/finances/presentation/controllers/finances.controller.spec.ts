import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FinancesController } from './finances.controller';
import { GetFinancialSummaryUseCase } from '../../application/use-cases/finances/get-financial-summary.use-case';
import { RecordIncomeUseCase } from '../../application/use-cases/finances/record-income.use-case';
import { RecordExpenseUseCase } from '../../application/use-cases/finances/record-expense.use-case';
import { ListTransactionsUseCase } from '../../application/use-cases/finances/list-transactions.use-case';
import { DeleteTransactionUseCase } from '../../application/use-cases/finances/delete-transaction.use-case';
import { GetLifetimeIncomeUseCase } from '../../application/use-cases/finances/get-lifetime-income.use-case';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { Reflector } from '@nestjs/core';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const mockUser: CurrentUserPayload = {
  sub: 'doctor-uuid-1',
  role: 'doctor',
  email: 'doctor@dev.local',
};

describe('FinancesController', () => {
  let controller: FinancesController;
  let mockSummary: jest.Mocked<GetFinancialSummaryUseCase>;
  let mockIncome: jest.Mocked<RecordIncomeUseCase>;
  let mockExpense: jest.Mocked<RecordExpenseUseCase>;
  let mockList: jest.Mocked<ListTransactionsUseCase>;
  let mockDeleteTx: jest.Mocked<DeleteTransactionUseCase>;
  let mockLifetime: jest.Mocked<GetLifetimeIncomeUseCase>;

  beforeEach(async () => {
    mockSummary = { execute: jest.fn() } as unknown as jest.Mocked<GetFinancialSummaryUseCase>;
    mockIncome = { execute: jest.fn() } as unknown as jest.Mocked<RecordIncomeUseCase>;
    mockExpense = { execute: jest.fn() } as unknown as jest.Mocked<RecordExpenseUseCase>;
    mockList = { execute: jest.fn() } as unknown as jest.Mocked<ListTransactionsUseCase>;
    mockDeleteTx = { execute: jest.fn() } as unknown as jest.Mocked<DeleteTransactionUseCase>;
    mockLifetime = { execute: jest.fn() } as unknown as jest.Mocked<GetLifetimeIncomeUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancesController],
      providers: [
        Reflector,
        { provide: GetFinancialSummaryUseCase, useValue: mockSummary },
        { provide: RecordIncomeUseCase, useValue: mockIncome },
        { provide: RecordExpenseUseCase, useValue: mockExpense },
        { provide: ListTransactionsUseCase, useValue: mockList },
        { provide: DeleteTransactionUseCase, useValue: mockDeleteTx },
        { provide: GetLifetimeIncomeUseCase, useValue: mockLifetime },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(FinancesController);
  });

  describe('GET /finances/summary', () => {
    it('returns summary for current month when no month param provided', async () => {
      const summaryData = {
        totalIncome: 350,
        totalExpenses: 80,
        net: 270,
        consultationCount: 3,
        pendingAmount: 100,
        netBS: 9720,
        currency: 'USD' as const,
        rateUsed: 36,
        month: '2026-06',
      };
      mockSummary.execute.mockResolvedValue(summaryData);

      const result = await controller.summary(mockUser, undefined);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(summaryData);
      expect(mockSummary.execute).toHaveBeenCalledWith({
        doctorId: 'doctor-uuid-1',
        month: undefined,
      });
    });

    it('passes month param to use case', async () => {
      mockSummary.execute.mockResolvedValue({
        totalIncome: 0,
        totalExpenses: 0,
        net: 0,
        consultationCount: 0,
        pendingAmount: 0,
        netBS: null,
        currency: 'USD' as const,
        rateUsed: null,
        month: '2026-05',
      });

      await controller.summary(mockUser, '2026-05');

      expect(mockSummary.execute).toHaveBeenCalledWith({
        doctorId: 'doctor-uuid-1',
        month: '2026-05',
      });
    });

    it('throws BadRequestException for invalid month format', async () => {
      await expect(controller.summary(mockUser, 'June-2026')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for out-of-range month (13)', async () => {
      await expect(controller.summary(mockUser, '2026-13')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for month 00', async () => {
      await expect(controller.summary(mockUser, '2026-00')).rejects.toThrow(BadRequestException);
    });

    it('always uses user.sub as doctorId (anti-IDOR)', async () => {
      mockSummary.execute.mockResolvedValue({
        totalIncome: 0,
        totalExpenses: 0,
        net: 0,
        consultationCount: 0,
        pendingAmount: 0,
        netBS: null,
        currency: 'USD' as const,
        rateUsed: null,
        month: '2026-06',
      });

      await controller.summary(mockUser, undefined);

      const callArg = mockSummary.execute.mock.calls[0]?.[0];
      expect(callArg?.doctorId).toBe('doctor-uuid-1');
    });
  });

  describe('GET /finances/transactions', () => {
    it('returns paginated transactions', async () => {
      mockList.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      const result = await controller.transactions(mockUser);

      expect(result.success).toBe(true);
      expect(result.meta).toEqual({ total: 0, page: 1, limit: 20 });
    });
  });

  describe('POST /finances/income', () => {
    it('records income and returns result', async () => {
      const incomeResult = {
        id: 'tx-id',
        doctorId: 'doctor-uuid-1',
        type: 'income' as const,
        amount: 100,
        currency: 'USD' as const,
        description: 'Fee',
        relatedConsultationId: null,
        date: new Date(),
        createdAt: new Date(),
      };
      mockIncome.execute.mockResolvedValue(incomeResult);

      const result = await controller.income(
        { amount: 100, currency: 'USD', description: 'Fee' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(mockIncome.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'doctor-uuid-1', amount: 100 }),
      );
    });
  });

  describe('POST /finances/expense', () => {
    it('records expense and returns result', async () => {
      const expenseResult = {
        id: 'tx-id-exp',
        doctorId: 'doctor-uuid-1',
        type: 'expense' as const,
        amount: 50,
        currency: 'USD' as const,
        description: 'Rent',
        relatedConsultationId: null,
        date: new Date(),
        createdAt: new Date(),
      };
      mockExpense.execute.mockResolvedValue(expenseResult);

      const result = await controller.expense(
        { amount: 50, currency: 'USD', description: 'Rent' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(mockExpense.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'doctor-uuid-1', amount: 50 }),
      );
    });
  });

  describe('DELETE /finances/transactions/:id', () => {
    it('deletes the transaction and returns 204 (void)', async () => {
      mockDeleteTx.execute.mockResolvedValue(undefined);

      const result = await controller.deleteTransactionHandler(
        'aaaabbbb-cccc-dddd-eeee-ffffaaaabbbb',
        mockUser,
      );

      expect(result).toBeUndefined();
      expect(mockDeleteTx.execute).toHaveBeenCalledWith({
        transactionId: 'aaaabbbb-cccc-dddd-eeee-ffffaaaabbbb',
        doctorId: 'doctor-uuid-1',
      });
    });
  });

  describe('GET /finances/lifetime', () => {
    it('returns all-time income totals', async () => {
      mockLifetime.execute.mockResolvedValue({
        totalUsd: 5000,
        totalBs: 182500,
        consultationCount: 100,
        rateUsed: 36.5,
      });

      const result = await controller.lifetime(mockUser);

      expect(result.success).toBe(true);
      expect(result.data.totalUsd).toBe(5000);
      expect(mockLifetime.execute).toHaveBeenCalledWith('doctor-uuid-1');
    });
  });
});
