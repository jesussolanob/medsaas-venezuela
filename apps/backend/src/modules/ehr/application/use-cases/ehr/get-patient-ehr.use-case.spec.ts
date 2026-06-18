import { GetPatientEhrUseCase } from './get-patient-ehr.use-case';
import type { IEhrRepository } from '../../../domain/repositories/ehr.repository';
import { EhrRecord } from '../../../domain/entities/ehr-record.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeRecord(): EhrRecord {
  return EhrRecord.create({
    id: 'eeeeeeee-0000-0000-0000-000000000001',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    diagnosis: 'Hypertension',
    treatmentPlan: 'Lifestyle changes',
    createdAt: now,
    updatedAt: now,
  });
}

describe('GetPatientEhrUseCase', () => {
  let useCase: GetPatientEhrUseCase;
  let mockRepo: jest.Mocked<IEhrRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatient: jest.fn(),
      findByConsultation: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    useCase = new GetPatientEhrUseCase(mockRepo);
  });

  it('returns the EHR history for the patient', async () => {
    const record = makeRecord();
    mockRepo.findByPatient.mockResolvedValue([record]);

    const result = await useCase.execute({ patientId: PATIENT_ID, doctorId: DOCTOR_ID });

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(record);
  });

  it('returns an empty array when no records exist', async () => {
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
