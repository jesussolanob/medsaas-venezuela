import { CreateConsultationUseCase } from './create-consultation.use-case';
import type { IConsultationRepository } from '../../../domain/repositories/consultation.repository';
import { Consultation } from '../../../domain/entities/consultation.entity';
import { ConsultationCodeExhaustedError } from '../../../domain/errors/consultation-code-exhausted.error';
import { ConsultationCodeConflictError } from '../../../domain/errors/consultation-code-conflict.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeSavedConsultation(code: string): Consultation {
  return Consultation.create({
    id: 'cccccccc-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: code,
    consultationDate: now,
    paymentStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

describe('CreateConsultationUseCase', () => {
  let useCase: CreateConsultationUseCase;
  let mockRepo: jest.Mocked<IConsultationRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      countByDoctorAndMonth: jest.fn(),
      getMaxSequenceForMonth: jest.fn().mockResolvedValue(0),
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
    };
    useCase = new CreateConsultationUseCase(mockRepo);
  });

  it('creates a consultation with a unique DLT-YYYYMM-XXXX code', async () => {
    mockRepo.countByDoctorAndMonth.mockResolvedValue(0);
    mockRepo.findByCode.mockResolvedValue(null);
    const expectedCode = 'DLT-202606-0001';
    mockRepo.save.mockImplementation(async (c) => c);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationDate: now,
    });

    expect(result.consultationCode).toBe(expectedCode);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('generates code in DLT-YYYYMM-XXXX format', async () => {
    mockRepo.getMaxSequenceForMonth.mockResolvedValue(41);
    mockRepo.findByCode.mockResolvedValue(null);
    mockRepo.save.mockImplementation(async (c) => c);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationDate: now,
    });

    expect(result.consultationCode).toMatch(/^DLT-\d{6}-\d{4,}$/);
    expect(result.consultationCode).toBe('DLT-202606-0042');
  });

  it('sets initial paymentStatus to pending', async () => {
    mockRepo.countByDoctorAndMonth.mockResolvedValue(0);
    mockRepo.findByCode.mockResolvedValue(null);
    mockRepo.save.mockImplementation(async (c) => c);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationDate: now,
    });

    expect(result.paymentStatus).toBe('pending');
  });

  it('links to appointment when appointmentId is provided', async () => {
    const appointmentId = 'bbbbbbbb-0000-0000-0000-000000000001';
    mockRepo.countByDoctorAndMonth.mockResolvedValue(0);
    mockRepo.findByCode.mockResolvedValue(null);
    mockRepo.save.mockImplementation(async (c) => c);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationDate: now,
      appointmentId,
    });

    expect(result.appointmentId).toBe(appointmentId);
  });

  it('retries when the generated code already exists (race condition)', async () => {
    const existingConsultation = makeSavedConsultation('DLT-202606-0001');
    mockRepo.countByDoctorAndMonth.mockResolvedValue(0);
    // First code exists, second does not
    mockRepo.findByCode.mockResolvedValueOnce(existingConsultation).mockResolvedValue(null);
    mockRepo.save.mockImplementation(async (c) => c);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationDate: now,
    });

    expect(result.consultationCode).toBe('DLT-202606-0002');
    expect(mockRepo.findByCode).toHaveBeenCalledTimes(2);
  });

  it('throws after MAX_RETRIES if all codes are taken', async () => {
    mockRepo.countByDoctorAndMonth.mockResolvedValue(0);
    mockRepo.findByCode.mockResolvedValue(makeSavedConsultation('DLT-202606-0001'));

    await expect(
      useCase.execute({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        consultationDate: now,
      }),
    ).rejects.toThrow(ConsultationCodeExhaustedError);
  });

  it('retries when save() throws ConsultationCodeConflictError (concurrent insert race)', async () => {
    // Simulates: pre-check passes (findByCode returns null) but the INSERT loses
    // the race to a concurrent request — repo.save() throws ConsultationCodeConflictError.
    // The use case must increment the sequence and succeed on the next attempt.
    mockRepo.countByDoctorAndMonth.mockResolvedValue(0);
    mockRepo.findByCode.mockResolvedValue(null); // pre-check always passes
    mockRepo.save
      .mockRejectedValueOnce(new ConsultationCodeConflictError('DLT-202606-0001'))
      .mockImplementation(async (c) => c); // second attempt succeeds

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationDate: now,
    });

    expect(result.consultationCode).toBe('DLT-202606-0002');
    expect(mockRepo.save).toHaveBeenCalledTimes(2);
  });

  it('throws ConsultationCodeExhaustedError when all save() attempts conflict', async () => {
    mockRepo.countByDoctorAndMonth.mockResolvedValue(0);
    mockRepo.findByCode.mockResolvedValue(null);
    mockRepo.save.mockRejectedValue(new ConsultationCodeConflictError('DLT-202606-0001'));

    await expect(
      useCase.execute({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        consultationDate: now,
      }),
    ).rejects.toThrow(ConsultationCodeExhaustedError);
  });

  it('passes chiefComplaint and notes to the created entity', async () => {
    mockRepo.countByDoctorAndMonth.mockResolvedValue(0);
    mockRepo.findByCode.mockResolvedValue(null);
    mockRepo.save.mockImplementation(async (c) => c);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationDate: now,
      chiefComplaint: 'Headache',
      notes: 'Initial note',
    });

    expect(result.chiefComplaint).toBe('Headache');
    expect(result.notes).toBe('Initial note');
  });
});
