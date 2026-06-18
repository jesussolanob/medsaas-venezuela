import { GetPrescriptionByIdUseCase } from './get-prescription-by-id.use-case';
import type { IPrescriptionRepository } from '../../../domain/repositories/prescription.repository';
import { Prescription } from '../../../domain/entities/prescription.entity';
import { PrescriptionNotFoundError } from '../../../domain/errors/prescription-not-found.error';
import { PrescriptionAccessDeniedError } from '../../../domain/errors/prescription-access-denied.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'dddddddd-0000-0000-0000-000000000002';
const PRESCRIPTION_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makePrescription(doctorId = DOCTOR_ID): Prescription {
  return Prescription.create({
    id: PRESCRIPTION_ID,
    doctorId,
    patientId: 'aaaaaaaa-0000-0000-0000-000000000001',
    medication: 'Metformin',
    dosage: '500mg',
    createdAt: now,
    updatedAt: now,
  });
}

describe('GetPrescriptionByIdUseCase', () => {
  let useCase: GetPrescriptionByIdUseCase;
  let mockRepo: jest.Mocked<IPrescriptionRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatient: jest.fn(),
      findByConsultation: jest.fn(),
      save: jest.fn(),
    };
    useCase = new GetPrescriptionByIdUseCase(mockRepo);
  });

  it('returns the prescription when found and owned', async () => {
    const prescription = makePrescription();
    mockRepo.findById.mockResolvedValue(prescription);

    const result = await useCase.execute({ prescriptionId: PRESCRIPTION_ID, doctorId: DOCTOR_ID });

    expect(result).toBe(prescription);
  });

  it('throws PrescriptionNotFoundError when the prescription does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ prescriptionId: PRESCRIPTION_ID, doctorId: DOCTOR_ID }),
    ).rejects.toThrow(PrescriptionNotFoundError);
  });

  it('throws PrescriptionNotFoundError when the prescription belongs to another doctor (anti-IDOR)', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ prescriptionId: PRESCRIPTION_ID, doctorId: OTHER_DOCTOR }),
    ).rejects.toThrow(PrescriptionNotFoundError);
  });

  it('passes the correct prescriptionId and doctorId to the repository', async () => {
    const prescription = makePrescription();
    mockRepo.findById.mockResolvedValue(prescription);

    await useCase.execute({ prescriptionId: PRESCRIPTION_ID, doctorId: DOCTOR_ID });

    expect(mockRepo.findById).toHaveBeenCalledWith(PRESCRIPTION_ID, DOCTOR_ID);
  });

  it('throws PrescriptionAccessDeniedError if repo returns a prescription owned by another doctor (defense-in-depth)', async () => {
    // Simulate a hypothetical future repo that returns unscoped results.
    const prescriptionOwnedByOther = makePrescription('dddddddd-0000-0000-0000-000000000099');
    mockRepo.findById.mockResolvedValue(prescriptionOwnedByOther);

    await expect(
      useCase.execute({ prescriptionId: PRESCRIPTION_ID, doctorId: DOCTOR_ID }),
    ).rejects.toThrow(PrescriptionAccessDeniedError);
  });
});
