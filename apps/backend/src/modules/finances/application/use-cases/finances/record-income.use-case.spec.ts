import { RecordIncomeUseCase } from './record-income.use-case';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import type { IFinanceRepository } from '../../../domain/repositories/finance.repository';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { Money } from '../../../domain/value-objects/money.vo';

describe('RecordIncomeUseCase', () => {
  let useCase: RecordIncomeUseCase;
  let mockRepo: jest.Mocked<IFinanceRepository>;

  const makeSavedTx = (overrides: Record<string, unknown> = {}) =>
    FinancialTransaction.create({
      id: 'saved-tx-id',
      doctorId: 'doc-id-1',
      type: 'income',
      amount: new Money(100, 'USD'),
      description: 'Fee',
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
    };
    useCase = new RecordIncomeUseCase(mockRepo);
  });

  it('records income and returns output DTO', async () => {
    mockRepo.save.mockResolvedValue(makeSavedTx());

    const result = await useCase.execute({
      doctorId: 'doc-id-1',
      amount: 100,
      currency: 'USD',
      description: 'Fee',
    });

    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(result.type).toBe('income');
    expect(result.amount).toBe(100);
    expect(result.currency).toBe('USD');
    expect(result.doctorId).toBe('doc-id-1');
  });

  it('throws InvalidAmountError for amount <= 0', async () => {
    await expect(
      useCase.execute({ doctorId: 'doc-id-1', amount: 0, currency: 'USD', description: 'Fee' }),
    ).rejects.toThrow(InvalidAmountError);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('rejects negative amount with InvalidAmountError', async () => {
    await expect(
      useCase.execute({ doctorId: 'doc-id-1', amount: -50, currency: 'USD', description: 'Fee' }),
    ).rejects.toThrow(InvalidAmountError);
  });

  it('sets relatedConsultationId when provided', async () => {
    mockRepo.save.mockResolvedValue(
      makeSavedTx({ relatedConsultationId: 'cons-id-1', amount: new Money(200, 'USD') }),
    );

    const result = await useCase.execute({
      doctorId: 'doc-id-1',
      amount: 200,
      currency: 'USD',
      description: 'Consultation fee',
      relatedConsultationId: 'cons-id-1',
    });

    expect(result.relatedConsultationId).toBe('cons-id-1');
  });

  it('uses provided date when given', async () => {
    const customDate = new Date('2026-05-10T08:00:00Z');
    mockRepo.save.mockResolvedValue(makeSavedTx({ date: customDate }));

    const result = await useCase.execute({
      doctorId: 'doc-id-1',
      amount: 100,
      currency: 'USD',
      description: 'Fee',
      date: customDate,
    });

    expect(result.date).toEqual(customDate);
  });

  it('accepts BS currency', async () => {
    mockRepo.save.mockResolvedValue(makeSavedTx({ amount: new Money(3600, 'BS') }));

    const result = await useCase.execute({
      doctorId: 'doc-id-1',
      amount: 3600,
      currency: 'BS',
      description: 'Fee in bolivares',
    });

    expect(result.currency).toBe('BS');
  });
});
