import { RecordIncomeUseCase } from './record-income.use-case';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import { IncomeConceptNotFoundError } from '../../../domain/errors/income-concept-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';
import type { IFinanceRepository } from '../../../domain/repositories/finance.repository';
import type { IIncomeConceptRepository } from '../../../domain/repositories/income-concept.repository';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { IncomeConcept } from '../../../domain/entities/income-concept.entity';
import { Money } from '../../../domain/value-objects/money.vo';

describe('RecordIncomeUseCase', () => {
  let useCase: RecordIncomeUseCase;
  let mockRepo: jest.Mocked<IFinanceRepository>;
  let mockConceptRepo: jest.Mocked<IIncomeConceptRepository>;

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
      conceptId: null,
      ...overrides,
    });

  const makeConcept = (overrides: Partial<Parameters<typeof IncomeConcept.create>[0]> = {}) =>
    IncomeConcept.create({
      id: 'concept-1',
      doctorId: 'doc-id-1',
      name: 'Consulta',
      isActive: true,
      sortOrder: 0,
      createdAt: new Date('2026-06-17T10:00:00Z'),
      updatedAt: new Date('2026-06-17T10:00:00Z'),
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
    };
    mockConceptRepo = {
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    useCase = new RecordIncomeUseCase(mockRepo, mockConceptRepo);
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
    expect(result.conceptId).toBeNull();
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

  describe('conceptId handling', () => {
    it('links a valid concept and returns conceptId in output', async () => {
      const concept = makeConcept();
      mockConceptRepo.findById.mockResolvedValue(concept);
      mockRepo.save.mockResolvedValue(makeSavedTx({ conceptId: 'concept-1' }));

      const result = await useCase.execute({
        doctorId: 'doc-id-1',
        amount: 100,
        currency: 'USD',
        description: 'Fee',
        conceptId: 'concept-1',
      });

      expect(mockConceptRepo.findById).toHaveBeenCalledWith('concept-1');
      expect(result.conceptId).toBe('concept-1');
    });

    it('throws IncomeConceptNotFoundError when concept is absent', async () => {
      mockConceptRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          doctorId: 'doc-id-1',
          amount: 100,
          currency: 'USD',
          description: 'Fee',
          conceptId: 'missing-concept',
        }),
      ).rejects.toThrow(IncomeConceptNotFoundError);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('throws ForbiddenDomainError when concept belongs to another doctor', async () => {
      mockConceptRepo.findById.mockResolvedValue(makeConcept({ doctorId: 'other-doc' }));

      await expect(
        useCase.execute({
          doctorId: 'doc-id-1',
          amount: 100,
          currency: 'USD',
          description: 'Fee',
          conceptId: 'concept-1',
        }),
      ).rejects.toThrow(ForbiddenDomainError);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('does not query concept repo when conceptId is omitted', async () => {
      mockRepo.save.mockResolvedValue(makeSavedTx());

      await useCase.execute({
        doctorId: 'doc-id-1',
        amount: 100,
        currency: 'USD',
        description: 'Fee',
      });

      expect(mockConceptRepo.findById).not.toHaveBeenCalled();
    });
  });
});
