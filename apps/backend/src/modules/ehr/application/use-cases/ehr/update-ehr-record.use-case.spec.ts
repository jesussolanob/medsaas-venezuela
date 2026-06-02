import { UpdateEhrRecordUseCase } from './update-ehr-record.use-case';
import type { IEhrRepository } from '../../../domain/repositories/ehr.repository';
import { EhrRecord } from '../../../domain/entities/ehr-record.entity';
import { EhrRecordNotFoundError } from '../../../domain/errors/ehr-record-not-found.error';
import { EhrRecordNotOwnedError } from '../../../domain/errors/ehr-record-not-owned.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const EHR_ID = 'eeeeeeee-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

function makeRecord(): EhrRecord {
  return EhrRecord.create({
    id: EHR_ID,
    doctorId: DOCTOR_ID,
    patientId: 'pppppppp-0000-0000-0000-000000000001',
    diagnosis: 'Original diagnosis',
    treatmentPlan: 'Original plan',
    createdAt: now,
    updatedAt: now,
  });
}

describe('UpdateEhrRecordUseCase', () => {
  let useCase: UpdateEhrRecordUseCase;
  let mockRepo: jest.Mocked<IEhrRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      findByPatient: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    useCase = new UpdateEhrRecordUseCase(mockRepo);
  });

  it('updates clinical fields when the doctor owns the record', async () => {
    const record = makeRecord();
    const updated = EhrRecord.create({ ...record, diagnosis: 'Updated diagnosis' });
    mockRepo.findById.mockResolvedValue(record);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({
      ehrId: EHR_ID,
      doctorId: DOCTOR_ID,
      diagnosis: 'Updated diagnosis',
    });

    expect(result.diagnosis).toBe('Updated diagnosis');
    expect(mockRepo.update).toHaveBeenCalledWith(EHR_ID, DOCTOR_ID, {
      diagnosis: 'Updated diagnosis',
      treatmentPlan: undefined,
    });
  });

  it('throws EhrRecordNotFoundError when the record does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ ehrId: EHR_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      EhrRecordNotFoundError,
    );
  });

  it('does not call update when record is not found', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ ehrId: EHR_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      EhrRecordNotFoundError,
    );

    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('throws EhrRecordNotOwnedError if repo returns a record owned by another doctor (defense-in-depth)', async () => {
    const recordOwnedByOtherDoctor = EhrRecord.create({
      id: EHR_ID,
      doctorId: 'dddddddd-0000-0000-0000-000000000099',
      patientId: 'pppppppp-0000-0000-0000-000000000001',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.findById.mockResolvedValue(recordOwnedByOtherDoctor);

    await expect(useCase.execute({ ehrId: EHR_ID, doctorId: DOCTOR_ID })).rejects.toThrow(
      EhrRecordNotOwnedError,
    );
  });
});
