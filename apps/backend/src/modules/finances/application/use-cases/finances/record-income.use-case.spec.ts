import { RecordIncomeUseCase } from './record-income.use-case';
import { InvalidAmountError } from '../../../domain/errors/invalid-amount.error';
import { IncomeConceptNotFoundError } from '../../../domain/errors/income-concept-not-found.error';
import { ForbiddenDomainError } from '../../../domain/errors/forbidden-domain.error';
import { PatientNotOwnedError } from '../../../domain/errors/patient-not-owned.error';
import { RelatedResourceNotFoundError } from '../../../domain/errors/related-resource-not-found.error';
import type { IFinanceRepository } from '../../../domain/repositories/finance.repository';
import type { IIncomeConceptRepository } from '../../../domain/repositories/income-concept.repository';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { FinancialTransaction } from '../../../domain/entities/financial-transaction.entity';
import { IncomeConcept } from '../../../domain/entities/income-concept.entity';
import { Consultation } from '../../../../consultations/domain/entities/consultation.entity';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import { Money } from '../../../domain/value-objects/money.vo';

describe('RecordIncomeUseCase', () => {
  let useCase: RecordIncomeUseCase;
  let mockRepo: jest.Mocked<IFinanceRepository>;
  let mockConceptRepo: jest.Mocked<IIncomeConceptRepository>;
  let mockConsultationRepo: jest.Mocked<IConsultationRepository>;
  let mockPatientRepo: jest.Mocked<IPatientRepository>;

  const makeSavedTx = (
    overrides: Partial<Parameters<typeof FinancialTransaction.create>[0]> = {},
  ) =>
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
      patientId: null,
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

  const makeConsultation = (
    overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {},
  ) =>
    new Consultation({
      id: 'cons-id-1',
      doctorId: 'doc-id-1',
      patientId: 'patient-id-1',
      appointmentId: null,
      consultationCode: 'DOC-202606-001',
      consultationDate: new Date('2026-06-01T10:00:00Z'),
      chiefComplaint: null,
      diagnosis: null,
      treatment: null,
      notes: null,
      paymentStatus: 'pending',
      paymentMethod: null,
      amount: null,
      paymentDate: null,
      blocksSnapshot: null,
      createdAt: new Date('2026-06-01T10:00:00Z'),
      updatedAt: new Date('2026-06-01T10:00:00Z'),
      ...overrides,
    });

  const makePatient = (overrides: Partial<Parameters<typeof Patient.create>[0]> = {}) =>
    Patient.create({
      id: 'patient-id-1',
      doctorId: 'doc-id-1',
      fullName: 'Juan Perez',
      createdAt: new Date('2026-06-01T10:00:00Z'),
      updatedAt: new Date('2026-06-01T10:00:00Z'),
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
    mockConceptRepo = {
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    mockConsultationRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      countByDoctorAndMonth: jest.fn(),
      getMaxSequenceForMonth: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      updatePayment: jest.fn(),
      updatePaymentDetails: jest.fn(),
      approveWithExtras: jest.fn(),
      findExtraItems: jest.fn(),
      list: jest.fn(),
      findByPatient: jest.fn(),
      findByAppointmentId: jest.fn(),
      deleteById: jest.fn().mockResolvedValue(undefined),
      listWithAppointment: jest.fn(),
      applyNoShowFee: jest.fn(),
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
    useCase = new RecordIncomeUseCase(
      mockRepo,
      mockConceptRepo,
      mockConsultationRepo,
      mockPatientRepo,
    );
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
    expect(result.patientId).toBeNull();
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
    const consultation = makeConsultation();
    mockConsultationRepo.findById.mockResolvedValue(consultation);
    mockRepo.save.mockResolvedValue(
      makeSavedTx({
        relatedConsultationId: 'cons-id-1',
        amount: new Money(200, 'USD'),
        patientId: 'patient-id-1',
      }),
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

  describe('patientId derivation from consultation', () => {
    it('derives patientId from consultation when relatedConsultationId is present', async () => {
      const consultation = makeConsultation({ patientId: 'patient-id-1' });
      mockConsultationRepo.findById.mockResolvedValue(consultation);
      mockRepo.save.mockResolvedValue(makeSavedTx({ patientId: 'patient-id-1' }));

      const result = await useCase.execute({
        doctorId: 'doc-id-1',
        amount: 100,
        currency: 'USD',
        description: 'Consultation fee',
        relatedConsultationId: 'cons-id-1',
        // body patientId should be IGNORED
        patientId: 'some-other-patient-id',
      });

      expect(mockConsultationRepo.findById).toHaveBeenCalledWith('cons-id-1', 'doc-id-1');
      // Patient repo should NOT be queried when consultation derives the patient.
      expect(mockPatientRepo.findById).not.toHaveBeenCalled();
      expect(result.patientId).toBe('patient-id-1');
    });

    it('throws RelatedResourceNotFoundError when consultation is not found (anti-dangling-FK)', async () => {
      mockConsultationRepo.findById.mockResolvedValue(null);

      // Fix 4: previously returned null silently; now throws to prevent persisting
      // a dangling FK to a consultation that doesn't exist or belongs to another doctor.
      await expect(
        useCase.execute({
          doctorId: 'doc-id-1',
          amount: 100,
          currency: 'USD',
          description: 'Fee',
          relatedConsultationId: 'foreign-cons-id',
        }),
      ).rejects.toThrow(RelatedResourceNotFoundError);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('patientId manual supply (no consultation)', () => {
    it('accepts a valid patient owned by the doctor', async () => {
      const patient = makePatient({ id: 'patient-id-1', doctorId: 'doc-id-1' });
      mockPatientRepo.findById.mockResolvedValue(patient);
      mockRepo.save.mockResolvedValue(makeSavedTx({ patientId: 'patient-id-1' }));

      const result = await useCase.execute({
        doctorId: 'doc-id-1',
        amount: 100,
        currency: 'USD',
        description: 'Fee',
        patientId: 'patient-id-1',
      });

      expect(mockPatientRepo.findById).toHaveBeenCalledWith('patient-id-1', 'doc-id-1');
      expect(result.patientId).toBe('patient-id-1');
    });

    it('throws PatientNotOwnedError when patient does not belong to the doctor', async () => {
      mockPatientRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          doctorId: 'doc-id-1',
          amount: 100,
          currency: 'USD',
          description: 'Fee',
          patientId: 'foreign-patient-id',
        }),
      ).rejects.toThrow(PatientNotOwnedError);
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('records income with patientId = null when no patient provided', async () => {
      mockRepo.save.mockResolvedValue(makeSavedTx({ patientId: null }));

      const result = await useCase.execute({
        doctorId: 'doc-id-1',
        amount: 100,
        currency: 'USD',
        description: 'Generic income',
      });

      expect(mockPatientRepo.findById).not.toHaveBeenCalled();
      expect(result.patientId).toBeNull();
    });
  });
});
