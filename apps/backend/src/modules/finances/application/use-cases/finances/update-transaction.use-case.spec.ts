import { UpdateTransactionUseCase } from './update-transaction.use-case';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { IncomeConcept } from '../../../domain/entities/income-concept.entity';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import { Money } from '../../../domain/value-objects/money.vo';
import { TransactionNotFoundError } from '../../../domain/errors/transaction-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';
import { IncomeConceptNotFoundError } from '../../../domain/errors/income-concept-not-found.error';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import { PatientNotOwnedError } from '../../../domain/errors/patient-not-owned.error';
import type { IFinanceRepository } from '../../../domain/repositories/finance.repository';
import type { IIncomeConceptRepository } from '../../../domain/repositories/income-concept.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';

const makeTx = (overrides: Partial<Parameters<typeof FinancialTransaction.create>[0]> = {}) =>
  FinancialTransaction.create({
    id: 'tx-1',
    doctorId: 'doc-1',
    type: 'income',
    amount: new Money(100, 'USD'),
    description: 'Fee',
    relatedConsultationId: null,
    date: new Date('2026-06-01T10:00:00Z'),
    createdAt: new Date('2026-06-01T10:00:00Z'),
    conceptId: null,
    patientId: null,
    ...overrides,
  });

const makeConcept = (overrides: Partial<Parameters<typeof IncomeConcept.create>[0]> = {}) =>
  IncomeConcept.create({
    id: 'concept-1',
    doctorId: 'doc-1',
    name: 'Consulta',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-06-17T10:00:00Z'),
    updatedAt: new Date('2026-06-17T10:00:00Z'),
    ...overrides,
  });

const makePatient = (overrides: Partial<Parameters<typeof Patient.create>[0]> = {}) =>
  Patient.create({
    id: 'patient-1',
    doctorId: 'doc-1',
    fullName: 'Juan Perez',
    createdAt: new Date('2026-06-01T10:00:00Z'),
    updatedAt: new Date('2026-06-01T10:00:00Z'),
    ...overrides,
  });

describe('UpdateTransactionUseCase', () => {
  let useCase: UpdateTransactionUseCase;
  let mockFinanceRepo: jest.Mocked<IFinanceRepository>;
  let mockConceptRepo: jest.Mocked<IIncomeConceptRepository>;
  let mockPatientRepo: jest.Mocked<IPatientRepository>;

  beforeEach(() => {
    mockFinanceRepo = {
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
    mockConceptRepo = {
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    mockPatientRepo = {
      findById: jest.fn(),
      findByCedulaHash: jest.fn(),
      findByEmailHash: jest.fn(),
      list: jest.fn(),
      findAllByDoctor: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      logReveal: jest.fn(),
    };
    useCase = new UpdateTransactionUseCase(mockFinanceRepo, mockConceptRepo, mockPatientRepo);
  });

  it('updates description and returns output DTO', async () => {
    const tx = makeTx();
    const updated = tx.patch({ description: 'Updated fee' });
    mockFinanceRepo.findById.mockResolvedValue(tx);
    mockFinanceRepo.updateTransaction.mockResolvedValue(updated);

    const result = await useCase.execute({
      transactionId: 'tx-1',
      doctorId: 'doc-1',
      description: 'Updated fee',
    });

    expect(mockFinanceRepo.updateTransaction).toHaveBeenCalledTimes(1);
    // Verify doctorId is passed as second arg (defense-in-depth gate).
    expect(mockFinanceRepo.updateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tx-1' }),
      'doc-1',
    );
    expect(result.description).toBe('Updated fee');
  });

  it('updates amount', async () => {
    const tx = makeTx();
    const updated = tx.patch({ amount: new Money(250, 'USD') });
    mockFinanceRepo.findById.mockResolvedValue(tx);
    mockFinanceRepo.updateTransaction.mockResolvedValue(updated);

    const result = await useCase.execute({
      transactionId: 'tx-1',
      doctorId: 'doc-1',
      amount: 250,
    });

    expect(result.amount).toBe(250);
  });

  it('throws TransactionNotFoundError when transaction is absent', async () => {
    mockFinanceRepo.findById.mockResolvedValue(null);
    await expect(useCase.execute({ transactionId: 'missing', doctorId: 'doc-1' })).rejects.toThrow(
      TransactionNotFoundError,
    );
    expect(mockFinanceRepo.updateTransaction).not.toHaveBeenCalled();
  });

  it('throws ForbiddenDomainError when transaction belongs to another doctor', async () => {
    mockFinanceRepo.findById.mockResolvedValue(makeTx({ doctorId: 'other-doc' }));
    await expect(useCase.execute({ transactionId: 'tx-1', doctorId: 'doc-1' })).rejects.toThrow(
      ForbiddenDomainError,
    );
    expect(mockFinanceRepo.updateTransaction).not.toHaveBeenCalled();
  });

  it('throws InvalidAmountError for amount <= 0', async () => {
    mockFinanceRepo.findById.mockResolvedValue(makeTx());
    await expect(
      useCase.execute({ transactionId: 'tx-1', doctorId: 'doc-1', amount: 0 }),
    ).rejects.toThrow(InvalidAmountError);
    expect(mockFinanceRepo.updateTransaction).not.toHaveBeenCalled();
  });

  it('rejects negative amount with InvalidAmountError', async () => {
    mockFinanceRepo.findById.mockResolvedValue(makeTx());
    await expect(
      useCase.execute({ transactionId: 'tx-1', doctorId: 'doc-1', amount: -10 }),
    ).rejects.toThrow(InvalidAmountError);
  });

  describe('conceptId handling', () => {
    it('validates concept ownership when conceptId is provided', async () => {
      const tx = makeTx();
      mockFinanceRepo.findById.mockResolvedValue(tx);
      mockConceptRepo.findById.mockResolvedValue(makeConcept());
      mockFinanceRepo.updateTransaction.mockResolvedValue(tx.patch({ conceptId: 'concept-1' }));

      const result = await useCase.execute({
        transactionId: 'tx-1',
        doctorId: 'doc-1',
        conceptId: 'concept-1',
      });

      expect(mockConceptRepo.findById).toHaveBeenCalledWith('concept-1');
      expect(result.conceptId).toBe('concept-1');
    });

    it('throws IncomeConceptNotFoundError when concept is absent', async () => {
      mockFinanceRepo.findById.mockResolvedValue(makeTx());
      mockConceptRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({ transactionId: 'tx-1', doctorId: 'doc-1', conceptId: 'missing' }),
      ).rejects.toThrow(IncomeConceptNotFoundError);
    });

    it('throws ForbiddenDomainError when concept belongs to another doctor', async () => {
      mockFinanceRepo.findById.mockResolvedValue(makeTx());
      mockConceptRepo.findById.mockResolvedValue(makeConcept({ doctorId: 'other-doc' }));

      await expect(
        useCase.execute({ transactionId: 'tx-1', doctorId: 'doc-1', conceptId: 'concept-1' }),
      ).rejects.toThrow(ForbiddenDomainError);
    });

    it('allows setting conceptId to null', async () => {
      const tx = makeTx({ conceptId: 'concept-1' });
      const updated = tx.patch({ conceptId: null });
      mockFinanceRepo.findById.mockResolvedValue(tx);
      mockFinanceRepo.updateTransaction.mockResolvedValue(updated);

      const result = await useCase.execute({
        transactionId: 'tx-1',
        doctorId: 'doc-1',
        conceptId: null,
      });

      expect(result.conceptId).toBeNull();
      expect(mockConceptRepo.findById).not.toHaveBeenCalled();
    });

    it('silently ignores conceptId on expense transactions', async () => {
      const tx = makeTx({ type: 'expense' });
      const updated = tx.patch({});
      mockFinanceRepo.findById.mockResolvedValue(tx);
      mockFinanceRepo.updateTransaction.mockResolvedValue(updated);

      await useCase.execute({
        transactionId: 'tx-1',
        doctorId: 'doc-1',
        conceptId: 'concept-1',
      });

      // concept repo should NOT be called for expense transactions
      expect(mockConceptRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('patientId handling', () => {
    it('validates patient ownership when patientId is provided on income transaction', async () => {
      const tx = makeTx();
      const patient = makePatient();
      mockFinanceRepo.findById.mockResolvedValue(tx);
      mockPatientRepo.findById.mockResolvedValue(patient);
      mockFinanceRepo.updateTransaction.mockResolvedValue(tx.patch({ patientId: 'patient-1' }));

      const result = await useCase.execute({
        transactionId: 'tx-1',
        doctorId: 'doc-1',
        patientId: 'patient-1',
      });

      expect(mockPatientRepo.findById).toHaveBeenCalledWith('patient-1', 'doc-1');
      expect(result.patientId).toBe('patient-1');
    });

    it('throws PatientNotOwnedError when patient does not belong to the doctor', async () => {
      mockFinanceRepo.findById.mockResolvedValue(makeTx());
      mockPatientRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          transactionId: 'tx-1',
          doctorId: 'doc-1',
          patientId: 'foreign-patient-id',
        }),
      ).rejects.toThrow(PatientNotOwnedError);
      expect(mockFinanceRepo.updateTransaction).not.toHaveBeenCalled();
    });

    it('allows unlinking patient by passing null', async () => {
      const tx = makeTx({ patientId: 'patient-1' });
      const updated = tx.patch({ patientId: null });
      mockFinanceRepo.findById.mockResolvedValue(tx);
      mockFinanceRepo.updateTransaction.mockResolvedValue(updated);

      const result = await useCase.execute({
        transactionId: 'tx-1',
        doctorId: 'doc-1',
        patientId: null,
      });

      expect(result.patientId).toBeNull();
      expect(mockPatientRepo.findById).not.toHaveBeenCalled();
    });

    it('silently ignores patientId on expense transactions', async () => {
      const tx = makeTx({ type: 'expense' });
      const updated = tx.patch({});
      mockFinanceRepo.findById.mockResolvedValue(tx);
      mockFinanceRepo.updateTransaction.mockResolvedValue(updated);

      await useCase.execute({
        transactionId: 'tx-1',
        doctorId: 'doc-1',
        patientId: 'some-patient-id',
      });

      // Patient repo should NOT be queried for expense transactions.
      expect(mockPatientRepo.findById).not.toHaveBeenCalled();
    });

    it('keeps existing patientId when not provided in input', async () => {
      const tx = makeTx({ patientId: 'patient-1' });
      // patch with no patientId = keep existing
      const updated = tx.patch({ description: 'New desc' });
      mockFinanceRepo.findById.mockResolvedValue(tx);
      mockFinanceRepo.updateTransaction.mockResolvedValue(updated);

      await useCase.execute({
        transactionId: 'tx-1',
        doctorId: 'doc-1',
        description: 'New desc',
      });

      // patientId undefined in input → patient repo NOT called.
      expect(mockPatientRepo.findById).not.toHaveBeenCalled();
    });
  });

  it('includes all expected output fields', async () => {
    const tx = makeTx();
    const updated = tx.patch({ description: 'New desc' });
    mockFinanceRepo.findById.mockResolvedValue(tx);
    mockFinanceRepo.updateTransaction.mockResolvedValue(updated);

    const result = await useCase.execute({
      transactionId: 'tx-1',
      doctorId: 'doc-1',
      description: 'New desc',
    });

    expect(result).toMatchObject({
      id: 'tx-1',
      doctorId: 'doc-1',
      type: 'income',
      currency: 'USD',
      relatedConsultationId: null,
      conceptId: null,
      patientId: null,
    });
    expect(result.createdAt).toBeDefined();
    expect(result.date).toBeDefined();
  });
});
