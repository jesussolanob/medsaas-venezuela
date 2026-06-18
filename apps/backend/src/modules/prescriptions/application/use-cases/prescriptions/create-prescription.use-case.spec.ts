import { CreatePrescriptionUseCase } from './create-prescription.use-case';
import type { IPrescriptionRepository } from '../../../domain/repositories/prescription.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { PatientNotOwnedError } from '../../../domain/errors/patient-not-owned.error';
import { Patient } from '../../../../patients/domain/entities/patient.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';

const now = new Date('2026-06-01T00:00:00Z');

function makePatient(): Patient {
  return Patient.create({
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'Test Patient',
    createdAt: now,
    updatedAt: now,
  });
}

describe('CreatePrescriptionUseCase', () => {
  let useCase: CreatePrescriptionUseCase;
  let mockRepo: jest.Mocked<IPrescriptionRepository>;
  let mockPatientRepo: jest.Mocked<Pick<IPatientRepository, 'findById'>>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatient: jest.fn(),
      findByConsultation: jest.fn(),
      save: jest.fn(),
    };
    mockPatientRepo = {
      findById: jest.fn(),
    };
    useCase = new CreatePrescriptionUseCase(mockRepo, mockPatientRepo as never);
  });

  it('creates a prescription with all fields when doctor owns the patient', async () => {
    const consultationId = 'cccccccc-0000-0000-0000-000000000001';
    mockPatientRepo.findById.mockResolvedValue(makePatient());
    mockRepo.save.mockImplementation(async (p) => p);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationId,
      medication: 'Metformin',
      dosage: '500mg',
      frequency: 'twice daily',
      duration: '30 days',
      notes: 'Take with meals',
    });

    expect(mockPatientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(result.doctorId).toBe(DOCTOR_ID);
    expect(result.patientId).toBe(PATIENT_ID);
    expect(result.consultationId).toBe(consultationId);
    expect(result.medication).toBe('Metformin');
    expect(result.dosage).toBe('500mg');
    expect(result.frequency).toBe('twice daily');
    expect(result.duration).toBe('30 days');
    expect(result.notes).toBe('Take with meals');
  });

  it('creates a prescription without a patient (patientId omitted)', async () => {
    mockRepo.save.mockImplementation(async (p) => p);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      medication: 'Aspirin',
    });

    // No patient ownership check when patientId is absent
    expect(mockPatientRepo.findById).not.toHaveBeenCalled();
    expect(result.patientId).toBeNull();
    expect(result.consultationId).toBeNull();
    expect(result.dosage).toBeNull();
    expect(result.frequency).toBeNull();
    expect(result.duration).toBeNull();
    expect(result.notes).toBeNull();
  });

  it('creates a prescription without a patient (patientId null)', async () => {
    mockRepo.save.mockImplementation(async (p) => p);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      medication: 'Aspirin',
      patientId: null,
    });

    expect(mockPatientRepo.findById).not.toHaveBeenCalled();
    expect(result.patientId).toBeNull();
  });

  it('throws PatientNotOwnedError when doctor does not own the patient', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        medication: 'Metformin',
      }),
    ).rejects.toThrow(PatientNotOwnedError);
  });

  it('does not call repo.save when ownership check fails', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID, medication: 'Metformin' }),
    ).rejects.toThrow(PatientNotOwnedError);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('assigns a UUID as id', async () => {
    mockRepo.save.mockImplementation(async (p) => p);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, medication: 'Aspirin' });

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('sets doctorId from the input (never from request body)', async () => {
    mockRepo.save.mockImplementation(async (p) => p);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, medication: 'Aspirin' });

    expect(result.doctorId).toBe(DOCTOR_ID);
  });

  it('propagates repository errors', async () => {
    mockRepo.save.mockRejectedValue(new Error('DB connection lost'));

    await expect(useCase.execute({ doctorId: DOCTOR_ID, medication: 'Aspirin' })).rejects.toThrow(
      'DB connection lost',
    );
  });
});
