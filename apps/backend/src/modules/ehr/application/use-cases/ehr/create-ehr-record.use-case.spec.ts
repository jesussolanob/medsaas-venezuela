import { CreateEhrRecordUseCase } from './create-ehr-record.use-case';
import type { IEhrRepository } from '../../../domain/repositories/ehr.repository';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';

describe('CreateEhrRecordUseCase', () => {
  let useCase: CreateEhrRecordUseCase;
  let mockRepo: jest.Mocked<IEhrRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatient: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    useCase = new CreateEhrRecordUseCase(mockRepo);
  });

  it('creates an EHR record with all fields', async () => {
    const consultationId = 'cccccccc-0000-0000-0000-000000000001';
    mockRepo.save.mockImplementation(async (r) => r);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
      consultationId,
      diagnosis: 'Hypertension',
      treatmentPlan: 'Lifestyle changes',
    });

    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(result.doctorId).toBe(DOCTOR_ID);
    expect(result.patientId).toBe(PATIENT_ID);
    expect(result.consultationId).toBe(consultationId);
    expect(result.diagnosis).toBe('Hypertension');
    expect(result.treatmentPlan).toBe('Lifestyle changes');
  });

  it('creates an EHR record with only required fields', async () => {
    mockRepo.save.mockImplementation(async (r) => r);

    const result = await useCase.execute({
      doctorId: DOCTOR_ID,
      patientId: PATIENT_ID,
    });

    expect(result.consultationId).toBeNull();
    expect(result.diagnosis).toBeNull();
    expect(result.treatmentPlan).toBeNull();
  });

  it('assigns a UUID as id', async () => {
    mockRepo.save.mockImplementation(async (r) => r);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('sets doctorId from the input (never from body)', async () => {
    mockRepo.save.mockImplementation(async (r) => r);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID });

    expect(result.doctorId).toBe(DOCTOR_ID);
  });

  it('propagates repository errors', async () => {
    mockRepo.save.mockRejectedValue(new Error('DB connection lost'));

    await expect(useCase.execute({ doctorId: DOCTOR_ID, patientId: PATIENT_ID })).rejects.toThrow(
      'DB connection lost',
    );
  });
});
