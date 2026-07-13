import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { FinancesController } from './finances.controller';
import { GetFinancialSummaryUseCase } from '../../application/use-cases/finances/get-financial-summary.use-case';
import { RecordIncomeUseCase } from '../../application/use-cases/finances/record-income.use-case';
import { RecordExpenseUseCase } from '../../application/use-cases/finances/record-expense.use-case';
import { ListTransactionsUseCase } from '../../application/use-cases/finances/list-transactions.use-case';
import { DeleteTransactionUseCase } from '../../application/use-cases/finances/delete-transaction.use-case';
import { GetLifetimeIncomeUseCase } from '../../application/use-cases/finances/get-lifetime-income.use-case';
import { ListIncomeConceptsUseCase } from '../../application/use-cases/finances/list-income-concepts.use-case';
import { CreateIncomeConceptUseCase } from '../../application/use-cases/finances/create-income-concept.use-case';
import { UpdateIncomeConceptUseCase } from '../../application/use-cases/finances/update-income-concept.use-case';
import { DeleteIncomeConceptUseCase } from '../../application/use-cases/finances/delete-income-concept.use-case';
import { UpdateTransactionUseCase } from '../../application/use-cases/finances/update-transaction.use-case';
import { ListIncomeTransactionsUseCase } from '../../application/use-cases/finances/list-income-transactions.use-case';
import { ListIncomeUseCase } from '../../application/use-cases/finances/list-income.use-case';
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
  let mockListConcepts: jest.Mocked<ListIncomeConceptsUseCase>;
  let mockCreateConcept: jest.Mocked<CreateIncomeConceptUseCase>;
  let mockUpdateConcept: jest.Mocked<UpdateIncomeConceptUseCase>;
  let mockDeleteConcept: jest.Mocked<DeleteIncomeConceptUseCase>;
  let mockUpdateTx: jest.Mocked<UpdateTransactionUseCase>;
  let mockListIncomeTx: jest.Mocked<ListIncomeTransactionsUseCase>;
  let mockListIncome: jest.Mocked<ListIncomeUseCase>;

  beforeEach(async () => {
    mockSummary = { execute: jest.fn() } as unknown as jest.Mocked<GetFinancialSummaryUseCase>;
    mockIncome = { execute: jest.fn() } as unknown as jest.Mocked<RecordIncomeUseCase>;
    mockExpense = { execute: jest.fn() } as unknown as jest.Mocked<RecordExpenseUseCase>;
    mockList = { execute: jest.fn() } as unknown as jest.Mocked<ListTransactionsUseCase>;
    mockDeleteTx = { execute: jest.fn() } as unknown as jest.Mocked<DeleteTransactionUseCase>;
    mockLifetime = { execute: jest.fn() } as unknown as jest.Mocked<GetLifetimeIncomeUseCase>;
    mockListConcepts = { execute: jest.fn() } as unknown as jest.Mocked<ListIncomeConceptsUseCase>;
    mockCreateConcept = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateIncomeConceptUseCase>;
    mockUpdateConcept = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateIncomeConceptUseCase>;
    mockDeleteConcept = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteIncomeConceptUseCase>;
    mockUpdateTx = { execute: jest.fn() } as unknown as jest.Mocked<UpdateTransactionUseCase>;
    mockListIncomeTx = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListIncomeTransactionsUseCase>;
    mockListIncome = { execute: jest.fn() } as unknown as jest.Mocked<ListIncomeUseCase>;

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
        { provide: ListIncomeConceptsUseCase, useValue: mockListConcepts },
        { provide: CreateIncomeConceptUseCase, useValue: mockCreateConcept },
        { provide: UpdateIncomeConceptUseCase, useValue: mockUpdateConcept },
        { provide: DeleteIncomeConceptUseCase, useValue: mockDeleteConcept },
        { provide: UpdateTransactionUseCase, useValue: mockUpdateTx },
        { provide: ListIncomeTransactionsUseCase, useValue: mockListIncomeTx },
        { provide: ListIncomeUseCase, useValue: mockListIncome },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(FinancesController);
  });

  describe('GET /finances/summary', () => {
    const emptyBreakdowns = {
      incomeBreakdown: { consultationsApproved: 0, consultationsPending: 0, manualIncome: 0 },
      expenseBreakdown: { rent: 0, staff: 0, supplies: 0, services: 0, taxes: 0, other: 0 },
    };

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
        ...emptyBreakdowns,
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
        ...emptyBreakdowns,
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
        ...emptyBreakdowns,
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
    const makeIncomeResult = (
      conceptId: string | null = null,
      patientId: string | null = null,
    ) => ({
      id: 'tx-id',
      doctorId: 'doctor-uuid-1',
      type: 'income' as const,
      amount: 100,
      currency: 'USD' as const,
      description: 'Fee',
      relatedConsultationId: null,
      conceptId,
      patientId,
      date: new Date(),
      createdAt: new Date(),
    });

    it('records income and returns result', async () => {
      mockIncome.execute.mockResolvedValue(makeIncomeResult());

      const result = await controller.income(
        { amount: 100, currency: 'USD', description: 'Fee' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(mockIncome.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'doctor-uuid-1', amount: 100, conceptId: null }),
      );
    });

    it('propagates conceptId to use-case when provided', async () => {
      mockIncome.execute.mockResolvedValue(makeIncomeResult('concept-uuid-1'));

      await controller.income(
        { amount: 100, currency: 'USD', description: 'Fee', conceptId: 'concept-uuid-1' },
        mockUser,
      );

      expect(mockIncome.execute).toHaveBeenCalledWith(
        expect.objectContaining({ conceptId: 'concept-uuid-1' }),
      );
    });

    it('sends conceptId as null when not provided in DTO', async () => {
      mockIncome.execute.mockResolvedValue(makeIncomeResult());

      await controller.income(
        { amount: 100, currency: 'USD', description: 'No concept' },
        mockUser,
      );

      const callArg = mockIncome.execute.mock.calls[0]?.[0];
      expect(callArg?.conceptId).toBeNull();
    });

    it('propagates patientId to use-case when provided', async () => {
      mockIncome.execute.mockResolvedValue(makeIncomeResult(null, 'patient-uuid-1'));

      await controller.income(
        { amount: 100, currency: 'USD', description: 'Fee', patientId: 'patient-uuid-1' },
        mockUser,
      );

      expect(mockIncome.execute).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'patient-uuid-1' }),
      );
    });

    it('sends patientId as null when not provided in DTO', async () => {
      mockIncome.execute.mockResolvedValue(makeIncomeResult());

      await controller.income(
        { amount: 100, currency: 'USD', description: 'No patient' },
        mockUser,
      );

      const callArg = mockIncome.execute.mock.calls[0]?.[0];
      expect(callArg?.patientId).toBeNull();
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
        expense_concept: null as null,
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

  describe('GET /finances/income-concepts', () => {
    it('returns active concepts list for the doctor', async () => {
      const concepts = [
        {
          id: 'c-1',
          doctorId: 'doctor-uuid-1',
          name: 'Consulta',
          isActive: true,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockListConcepts.execute.mockResolvedValue(concepts);

      const result = await controller.listConcepts(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockListConcepts.execute).toHaveBeenCalledWith('doctor-uuid-1');
    });
  });

  describe('POST /finances/income-concepts', () => {
    it('creates a concept and returns it', async () => {
      const output = {
        id: 'c-new',
        doctorId: 'doctor-uuid-1',
        name: 'Urgencia',
        isActive: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCreateConcept.execute.mockResolvedValue(output);

      const result = await controller.createConcept({ name: 'Urgencia' }, mockUser);

      expect(result.success).toBe(true);
      expect(mockCreateConcept.execute).toHaveBeenCalledWith({
        doctorId: 'doctor-uuid-1',
        name: 'Urgencia',
      });
    });
  });

  describe('PUT /finances/income-concepts/:id', () => {
    it('updates a concept and returns it', async () => {
      const output = {
        id: 'c-1',
        doctorId: 'doctor-uuid-1',
        name: 'Consulta actualizada',
        isActive: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUpdateConcept.execute.mockResolvedValue(output);

      const result = await controller.updateConcept(
        'c-1',
        { name: 'Consulta actualizada' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(mockUpdateConcept.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'c-1',
          doctorId: 'doctor-uuid-1',
          name: 'Consulta actualizada',
        }),
      );
    });
  });

  describe('DELETE /finances/income-concepts/:id', () => {
    it('soft-deletes a concept and returns void', async () => {
      mockDeleteConcept.execute.mockResolvedValue(undefined);

      const result = await controller.deleteConcept('c-1', mockUser);

      expect(result).toBeUndefined();
      expect(mockDeleteConcept.execute).toHaveBeenCalledWith({
        id: 'c-1',
        doctorId: 'doctor-uuid-1',
      });
    });
  });

  describe('PUT /finances/transactions/:id', () => {
    const makeUpdateOutput = (overrides: Record<string, unknown> = {}) => ({
      id: 'tx-1',
      doctorId: 'doctor-uuid-1',
      type: 'income' as const,
      amount: 200,
      currency: 'USD' as const,
      description: 'Updated',
      relatedConsultationId: null,
      conceptId: null,
      patientId: null,
      date: new Date(),
      createdAt: new Date(),
      ...overrides,
    });

    it('updates a transaction and returns it', async () => {
      mockUpdateTx.execute.mockResolvedValue(makeUpdateOutput());

      const result = await controller.updateTransactionHandler(
        'tx-1',
        { description: 'Updated', amount: 200 },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.description).toBe('Updated');
      expect(mockUpdateTx.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: 'tx-1',
          doctorId: 'doctor-uuid-1',
          description: 'Updated',
          amount: 200,
        }),
      );
    });

    it('always uses user.sub as doctorId (anti-IDOR)', async () => {
      mockUpdateTx.execute.mockResolvedValue(makeUpdateOutput({ description: 'Fee', amount: 100 }));

      await controller.updateTransactionHandler('tx-1', { description: 'Fee' }, mockUser);

      const callArg = mockUpdateTx.execute.mock.calls[0]?.[0];
      expect(callArg?.doctorId).toBe('doctor-uuid-1');
    });

    it('propagates patientId to use-case when provided', async () => {
      mockUpdateTx.execute.mockResolvedValue(makeUpdateOutput({ patientId: 'patient-uuid-1' }));

      await controller.updateTransactionHandler(
        'tx-1',
        { description: 'Fee', patientId: 'patient-uuid-1' },
        mockUser,
      );

      expect(mockUpdateTx.execute).toHaveBeenCalledWith(
        expect.objectContaining({ patientId: 'patient-uuid-1' }),
      );
    });
  });

  describe('GET /finances/income', () => {
    const makeIncomeItem = (source: 'consultation' | 'manual' = 'consultation') => ({
      id: 'item-1',
      date: new Date('2026-06-15T10:00:00Z'),
      amount_usd: 150,
      source,
      status: source === 'consultation' ? ('approved' as const) : null,
      concept: source === 'manual' ? 'Honorarios' : null,
      patient_id: 'p-1',
      patient_name: 'Ana López',
      reference: source === 'consultation' ? 'PAY-001' : null,
    });

    it('returns paginated income list with meta', async () => {
      const items = [makeIncomeItem('consultation'), makeIncomeItem('manual')];
      mockListIncome.execute.mockResolvedValue({ items, total: 2, page: 1, limit: 20 });

      const result = await controller.incomeList(mockUser, undefined, '1', '20');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 20 });
    });

    it('passes month filter when provided', async () => {
      mockListIncome.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.incomeList(mockUser, '2026-06', '1', '20');

      expect(mockListIncome.execute).toHaveBeenCalledWith(
        expect.objectContaining({ month: '2026-06', doctorId: 'doctor-uuid-1' }),
      );
    });

    it('uses user.sub as doctorId (anti-IDOR)', async () => {
      mockListIncome.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await controller.incomeList(mockUser);

      const callArg = mockListIncome.execute.mock.calls[0]?.[0];
      expect(callArg?.doctorId).toBe('doctor-uuid-1');
    });

    it('throws BadRequestException for invalid month format', async () => {
      await expect(controller.incomeList(mockUser, 'bad-date')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for month=00 (out of range)', async () => {
      await expect(controller.incomeList(mockUser, '2026-00')).rejects.toThrow(BadRequestException);
    });

    it('returns empty data with total 0 when no income exists', async () => {
      mockListIncome.execute.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      const result = await controller.incomeList(mockUser, '2020-01');

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('item from consultation source has status field', async () => {
      const items = [makeIncomeItem('consultation')];
      mockListIncome.execute.mockResolvedValue({ items, total: 1, page: 1, limit: 20 });

      const result = await controller.incomeList(mockUser);

      expect(result.data[0]?.source).toBe('consultation');
      expect(result.data[0]?.status).toBe('approved');
    });

    it('item from manual source has concept field and null status', async () => {
      const items = [makeIncomeItem('manual')];
      mockListIncome.execute.mockResolvedValue({ items, total: 1, page: 1, limit: 20 });

      const result = await controller.incomeList(mockUser);

      expect(result.data[0]?.source).toBe('manual');
      expect(result.data[0]?.concept).toBe('Honorarios');
      expect(result.data[0]?.status).toBeNull();
    });

    it('exposes patient_id and patient_name (owner-scoped, decrypted by repo)', async () => {
      const items = [makeIncomeItem('consultation')];
      mockListIncome.execute.mockResolvedValue({ items, total: 1, page: 1, limit: 20 });

      const result = await controller.incomeList(mockUser);

      const item = result.data[0] as unknown as Record<string, unknown>;
      expect(item['patient_id']).toBe('p-1');
      // patient_name is the plaintext returned by the repo's owner-scoped decrypt.
      // The controller passes it through unchanged — it is NOT undefined.
      expect(item['patient_name']).toBe('Ana López');
    });

    it('patient_name is null when patient is not linked to income row', async () => {
      const items = [{ ...makeIncomeItem('consultation'), patient_id: null, patient_name: null }];
      mockListIncome.execute.mockResolvedValue({ items, total: 1, page: 1, limit: 20 });

      const result = await controller.incomeList(mockUser);

      const item = result.data[0] as unknown as Record<string, unknown>;
      expect(item['patient_name']).toBeNull();
    });
  });

  describe('GET /finances/income-transactions', () => {
    it('returns income transactions for the doctor', async () => {
      const items = [
        {
          id: 'tx-1',
          amount: 100,
          currency: 'USD',
          description: 'Consulta',
          date: new Date('2026-06-01T10:00:00Z'),
          conceptId: null,
          patientId: 'p-1',
          patientName: 'Juan Perez',
        },
      ];
      mockListIncomeTx.execute.mockResolvedValue(items);

      const result = await controller.incomeTransactions(mockUser, '2026-06');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.patientName).toBe('Juan Perez');
      expect(mockListIncomeTx.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: 'doctor-uuid-1', month: '2026-06' }),
      );
    });

    it('uses user.sub as doctorId (anti-IDOR)', async () => {
      mockListIncomeTx.execute.mockResolvedValue([]);

      await controller.incomeTransactions(mockUser);

      const callArg = mockListIncomeTx.execute.mock.calls[0]?.[0];
      expect(callArg?.doctorId).toBe('doctor-uuid-1');
    });

    it('returns empty array when no income transactions exist', async () => {
      mockListIncomeTx.execute.mockResolvedValue([]);

      const result = await controller.incomeTransactions(mockUser, '2026-01');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('throws BadRequestException for invalid month format', async () => {
      await expect(controller.incomeTransactions(mockUser, 'badformat')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
