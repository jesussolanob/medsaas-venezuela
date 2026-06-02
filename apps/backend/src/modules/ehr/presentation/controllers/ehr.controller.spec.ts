import { Test, type TestingModule } from '@nestjs/testing';
import { EhrController } from './ehr.controller';
import { CreateEhrRecordUseCase } from '../../application/use-cases/ehr/create-ehr-record.use-case';
import { GetPatientEhrUseCase } from '../../application/use-cases/ehr/get-patient-ehr.use-case';
import { UpdateEhrRecordUseCase } from '../../application/use-cases/ehr/update-ehr-record.use-case';
import { GetEhrByIdUseCase } from '../../application/use-cases/ehr/get-ehr-by-id.use-case';
import { EhrRecord } from '../../domain/entities/ehr-record.entity';
import { EhrRecordNotFoundError } from '../../domain/errors/ehr-record-not-found.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const EHR_ID = 'eeeeeeee-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makeRecord(
  overrides: Partial<ConstructorParameters<typeof EhrRecord>[0]> = {},
): EhrRecord {
  return EhrRecord.create({
    id: EHR_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationId: null,
    diagnosis: 'Hypertension',
    treatmentPlan: 'Lifestyle changes',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('EhrController', () => {
  let controller: EhrController;

  const mockCreate = { execute: jest.fn() };
  const mockGetPatientEhr = { execute: jest.fn() };
  const mockUpdate = { execute: jest.fn() };
  const mockGetById = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EhrController],
      providers: [
        { provide: CreateEhrRecordUseCase, useValue: mockCreate },
        { provide: GetPatientEhrUseCase, useValue: mockGetPatientEhr },
        { provide: UpdateEhrRecordUseCase, useValue: mockUpdate },
        { provide: GetEhrByIdUseCase, useValue: mockGetById },
      ],
    }).compile();

    controller = module.get<EhrController>(EhrController);
  });

  describe('getPatientHistory', () => {
    it('returns EHR records for a patient', async () => {
      const record = makeRecord();
      mockGetPatientEhr.execute.mockResolvedValue([record]);

      const result = await controller.getPatientHistory(PATIENT_ID, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('passes doctorId from authenticated user', async () => {
      mockGetPatientEhr.execute.mockResolvedValue([]);

      await controller.getPatientHistory(PATIENT_ID, mockUser);

      expect(mockGetPatientEhr.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, patientId: PATIENT_ID }),
      );
    });

    it('returns an empty array when no records exist', async () => {
      mockGetPatientEhr.execute.mockResolvedValue([]);

      const result = await controller.getPatientHistory(PATIENT_ID, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('returns a single EHR record', async () => {
      const record = makeRecord();
      mockGetById.execute.mockResolvedValue(record);

      const result = await controller.findOne(EHR_ID, mockUser);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).id).toBe(EHR_ID);
      expect((result.data as Record<string, unknown>).diagnosis).toBe('Hypertension');
    });

    it('propagates EhrRecordNotFoundError', async () => {
      mockGetById.execute.mockRejectedValue(new EhrRecordNotFoundError());

      await expect(controller.findOne(EHR_ID, mockUser)).rejects.toThrow(EhrRecordNotFoundError);
    });
  });

  describe('create', () => {
    it('creates an EHR record and returns it', async () => {
      const record = makeRecord();
      mockCreate.execute.mockResolvedValue(record);

      const dto = { patient_id: PATIENT_ID, diagnosis: 'Hypertension' };
      const result = await controller.create(dto, mockUser);

      expect(result.success).toBe(true);
      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, patientId: PATIENT_ID }),
      );
    });

    it('uses authenticated user doctorId — not any body field', async () => {
      const record = makeRecord();
      mockCreate.execute.mockResolvedValue(record);

      await controller.create({ patient_id: PATIENT_ID }, mockUser);

      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });

    it('maps treatment_plan from dto to use-case input', async () => {
      const record = makeRecord();
      mockCreate.execute.mockResolvedValue(record);

      await controller.create(
        { patient_id: PATIENT_ID, treatment_plan: 'Lifestyle changes' },
        mockUser,
      );

      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ treatmentPlan: 'Lifestyle changes' }),
      );
    });
  });

  describe('update', () => {
    it('updates clinical fields', async () => {
      const record = makeRecord({ diagnosis: 'Updated diagnosis' });
      mockUpdate.execute.mockResolvedValue(record);

      const result = await controller.update(EHR_ID, { diagnosis: 'Updated diagnosis' }, mockUser);

      expect(result.success).toBe(true);
      expect(mockUpdate.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ehrId: EHR_ID,
          doctorId: DOCTOR_ID,
          diagnosis: 'Updated diagnosis',
        }),
      );
    });

    it('propagates EhrRecordNotFoundError on update of unknown record', async () => {
      mockUpdate.execute.mockRejectedValue(new EhrRecordNotFoundError());

      await expect(controller.update(EHR_ID, { diagnosis: 'X' }, mockUser)).rejects.toThrow(
        EhrRecordNotFoundError,
      );
    });
  });
});
