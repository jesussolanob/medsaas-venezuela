import { RecordExpenseUseCase } from './record-expense.use-case';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import type { IFinanceRepository } from '../../../domain/repositories/finance.repository';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { Money } from '../../../domain/value-objects/money.vo';

describe('RecordExpenseUseCase', () => {
  let useCase: RecordExpenseUseCase;
  let mockRepo: jest.Mocked<IFinanceRepository>;

  const makeSavedTx = (
    overrides: Partial<Parameters<typeof FinancialTransaction.create>[0]> = {},
  ) =>
    FinancialTransaction.create({
      id: 'saved-tx-id',
      doctorId: 'doc-id-1',
      type: 'expense',
      amount: new Money(50, 'USD'),
      description: 'Office supplies',
      relatedConsultationId: null,
      date: new Date('2026-06-01T10:00:00Z'),
      createdAt: new Date('2026-06-01T10:00:00Z'),
      ...overrides,
    });

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
      listIncomeTransactions: jest.fn(),
      listIncomePaginated: jest.fn(),
      getIncomeBreakdown: jest.fn(),
      getExpenseBreakdown: jest.fn(),
    };
    useCase = new RecordExpenseUseCase(mockRepo);
  });

  it('records an expense and returns output DTO', async () => {
    mockRepo.save.mockResolvedValue(makeSavedTx());

    const result = await useCase.execute({
      doctorId: 'doc-id-1',
      amount: 50,
      currency: 'USD',
      description: 'Office supplies',
    });

    expect(result.type).toBe('expense');
    expect(result.amount).toBe(50);
    expect(result.currency).toBe('USD');
  });

  it('throws InvalidAmountError for amount <= 0', async () => {
    await expect(
      useCase.execute({
        doctorId: 'doc-id-1',
        amount: 0,
        currency: 'USD',
        description: 'Office supplies',
      }),
    ).rejects.toThrow(InvalidAmountError);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('throws InvalidAmountError for negative amount', async () => {
    await expect(
      useCase.execute({
        doctorId: 'doc-id-1',
        amount: -10,
        currency: 'USD',
        description: 'Bad value',
      }),
    ).rejects.toThrow(InvalidAmountError);
  });

  it('persists as type expense', async () => {
    mockRepo.save.mockResolvedValue(makeSavedTx());
    await useCase.execute({
      doctorId: 'doc-id-1',
      amount: 50,
      currency: 'USD',
      description: 'Office supplies',
    });
    const savedArg = mockRepo.save.mock.calls[0]?.[0] as FinancialTransaction;
    expect(savedArg?.type).toBe('expense');
  });

  it('passes expense_concept to the domain entity when provided', async () => {
    mockRepo.save.mockResolvedValue(makeSavedTx({ expenseConcept: 'rent' }));

    await useCase.execute({
      doctorId: 'doc-id-1',
      amount: 200,
      currency: 'USD',
      description: 'Monthly office rent',
      concept: 'rent',
    });

    const savedArg = mockRepo.save.mock.calls[0]?.[0] as FinancialTransaction;
    expect(savedArg?.expenseConcept).toBe('rent');
  });

  it('returns expense_concept in output DTO', async () => {
    mockRepo.save.mockResolvedValue(makeSavedTx({ expenseConcept: 'supplies' }));

    const result = await useCase.execute({
      doctorId: 'doc-id-1',
      amount: 30,
      currency: 'USD',
      description: 'Papel para impresora',
      concept: 'supplies',
    });

    expect(result.expense_concept).toBe('supplies');
  });

  it('returns expense_concept as null when not provided', async () => {
    mockRepo.save.mockResolvedValue(makeSavedTx({ expenseConcept: null }));

    const result = await useCase.execute({
      doctorId: 'doc-id-1',
      amount: 50,
      currency: 'USD',
      description: 'Miscellaneous',
    });

    expect(result.expense_concept).toBeNull();
  });
});
