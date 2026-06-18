import { GetEhrByIdUseCase } from './get-ehr-by-id.use-case';
import type { IEhrRepository } from '../../../domain/repositories/ehr.repository';
import { EhrRecord } from '../../../domain/entities/ehr-record.entity';
import { EhrRecordNotFoundError } from '../../../domain/errors/ehr-record-not-found.error';
import { EhrRecordNotOwnedError } from '../../../domain/errors/ehr-record-not-owned.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'dddddddd-0000-0000-0000-000000000002';
const EHR_ID = 'eeeeeeee-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeRecord(doctorId = DOCTOR_ID): EhrRecord {
  return EhrRecord.create({
    id: EHR_ID,
    doctorId,
    patientId: 'pppppppp-0000-0000-0000-000000000001',
    diagnosis: 'Hypertension',
    createdAt: now,
    updatedAt: now,
  });
}

describe('GetEhrByIdUseCase', () => {
  let useCase: GetEhrByIdUseCase;
  let mockRepo: jest.Mocked<IEhrRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatient: jest.fn(),
      findByConsultation: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    useCase = new GetEhrByIdUseCase(mockRepo);
  });

  it('returns the EHR record when found and owned', async () => {
    const record = makeRecord();
    mockRepo.findById.mockResolvedValue(record);

    const result = await useCase.execute({ ehrId: EHR_ID, doctorId: DOCTOR_ID });

    expect(result).toBe(record);
  });

  it('throws EhrRecordNotFoundError when the record does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ ehrId: EHR_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      EhrRecordNotFoundError,
    );
  });

  it('throws EhrRecordNotFoundError when the record belongs to another doctor (anti-IDOR)', async () => {
    // The repo returns null for a different doctorId (scoped query), so not-found is thrown.
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ ehrId: EHR_ID, doctorId: OTHER_DOCTOR })).rejects.toThrow(
      EhrRecordNotFoundError,
    );
  });

  it('passes the correct ehrId and doctorId to the repository', async () => {
    const record = makeRecord();
    mockRepo.findById.mockResolvedValue(record);

    await useCase.execute({ ehrId: EHR_ID, doctorId: DOCTOR_ID });

    expect(mockRepo.findById).toHaveBeenCalledWith(EHR_ID, DOCTOR_ID);
  });

  it('throws EhrRecordNotOwnedError if repo returns a record owned by another doctor (defense-in-depth)', async () => {
    // Simulate a hypothetical future repo that returns unscoped results.
    const recordOwnedByOtherDoctor = makeRecord('dddddddd-0000-0000-0000-000000000099');
    mockRepo.findById.mockResolvedValue(recordOwnedByOtherDoctor);

    await expect(useCase.execute({ ehrId: EHR_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      EhrRecordNotOwnedError,
    );
  });
});
