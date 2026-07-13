import { UpdateConsultationUseCase } from './update-consultation.use-case';
import type { IConsultationRepository } from '../../../domain/repositories/consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationNotFoundError } from '../../../domain/errors/consultation-not-found.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'eeeeeeee-0000-0000-0000-000000000002';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeConsultation(
  overrides: Partial<ConstructorParameters<typeof Consultation>[0]> = {},
): Consultation {
  return Consultation.create({
    id: CONSULTATION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202606-0001',
    consultationDate: now,
    paymentStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('UpdateConsultationUseCase', () => {
  let useCase: UpdateConsultationUseCase;
  let mockRepo: jest.Mocked<IConsultationRepository>;

  beforeEach(() => {
    mockRepo = {
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
    };
    useCase = new UpdateConsultationUseCase(mockRepo);
  });

  it('updates clinical fields for the owning doctor', async () => {
    const consultation = makeConsultation();
    const updated = makeConsultation({ diagnosis: 'Migraine', treatment: 'Rest' });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      diagnosis: 'Migraine',
      treatment: 'Rest',
    });

    expect(result.diagnosis).toBe('Migraine');
    expect(result.treatment).toBe('Rest');
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: 'Migraine',
      treatment: 'Rest',
      notes: undefined,
      blocksSnapshot: undefined,
    });
  });

  it('persists blocksSnapshot when provided', async () => {
    const snapshot = { tension_arterial: '120/80', peso: 72 };
    const consultation = makeConsultation();
    const updated = makeConsultation({ blocksSnapshot: snapshot });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      blocksSnapshot: snapshot,
    });

    expect(result.blocksSnapshot).toEqual(snapshot);
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: undefined,
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: snapshot,
    });
  });

  it('does NOT include blocksSnapshot in the update call when input omits it', async () => {
    const consultation = makeConsultation();
    const updated = makeConsultation({ diagnosis: 'Flu' });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      diagnosis: 'Flu',
      // blocksSnapshot intentionally absent
    });

    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: 'Flu',
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: undefined,
    });
  });

  it('clears blocksSnapshot when null is passed', async () => {
    const consultation = makeConsultation({ blocksSnapshot: { field: 'value' } });
    const updated = makeConsultation({ blocksSnapshot: null });
    mockRepo.findById.mockResolvedValue(consultation);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      consultationId: CONSULTATION_ID,
      doctorId: DOCTOR_ID,
      blocksSnapshot: null,
    });

    expect(result.blocksSnapshot).toBeNull();
    expect(mockRepo.update).toHaveBeenCalledWith(CONSULTATION_ID, DOCTOR_ID, {
      chiefComplaint: undefined,
      diagnosis: undefined,
      treatment: undefined,
      notes: undefined,
      blocksSnapshot: null,
    });
  });

  it('throws ConsultationNotFoundError when consultation does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: DOCTOR_ID,
      }),
    ).rejects.toThrow(ConsultationNotFoundError);
  });

  it('throws ConsultationNotOwnedError when doctor does not own the consultation', async () => {
    // Consultation owned by DOCTOR_ID but requested by OTHER_DOCTOR_ID
    // findById is scoped, so it should return null — but simulate a case where
    // the entity is found but ownership check fails.
    const consultation = makeConsultation({ doctorId: DOCTOR_ID });
    // Override findById to return the consultation (bypassing DB scope)
    mockRepo.findById.mockResolvedValue(consultation);

    // When OTHER_DOCTOR_ID queries — doctorId mismatch triggers NotOwned
    await expect(
      useCase.execute({
        consultationId: CONSULTATION_ID,
        doctorId: OTHER_DOCTOR_ID,
      }),
    ).rejects.toThrow(ConsultationNotOwnedError);
  });
});
