import { GetPatientPrescriptionsUseCase } from './get-patient-prescriptions.use-case';
import type { IPrescriptionRepository } from '../../../domain/repositories/prescription.repository';
import { Prescription } from '../../../domain/entities/prescription.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makePrescription(): Prescription {
  return Prescription.create({
    id: 'pppppppp-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    medication: 'Metformin',
    dosage: '500mg',
    createdAt: now,
    updatedAt: now,
  });
}

describe('GetPatientPrescriptionsUseCase', () => {
  let useCase: GetPatientPrescriptionsUseCase;
  let mockRepo: jest.Mocked<IPrescriptionRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatient: jest.fn(),
      findByConsultation: jest.fn(),
      save: jest.fn(),
    };
    useCase = new GetPatientPrescriptionsUseCase(mockRepo);
  });

  it('returns prescriptions for the patient', async () => {
    const prescription = makePrescription();
    mockRepo.findByPatient.mockResolvedValue([prescription]);

    const result = await useCase.execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(prescription);
  });

  it('returns an empty array when no prescriptions exist', async () => {
    mockRepo.findByPatient.mockResolvedValue([]);

    const result = await useCase.execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID });

    expect(result).toHaveLength(0);
  });

  it('passes both patientId and doctorId to the repository', async () => {
    mockRepo.findByPatient.mockResolvedValue([]);

    await useCase.execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID });

    expect(mockRepo.findByPatient).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
  });

  it('propagates repository errors', async () => {
    mockRepo.findByPatient.mockRejectedValue(new Error('DB error'));

    await expect(useCase.execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      'DB error',
    );
  });
});
