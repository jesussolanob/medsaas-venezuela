import { Test, type TestingModule } from '@nestjs/testing';
import { PrescriptionsController } from './prescriptions.controller';
import { CreatePrescriptionUseCase } from '../../application/use-cases/prescriptions/create-prescription.use-case';
import { GetPatientPrescriptionsUseCase } from '../../application/use-cases/prescriptions/get-patient-prescriptions.use-case';
import { GetPrescriptionByIdUseCase } from '../../application/use-cases/prescriptions/get-prescription-by-id.use-case';
import { Prescription } from '../../domain/entities/prescription.entity';
import { PrescriptionNotFoundError } from '../../domain/errors/prescription-not-found.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const PATIENT_ID = 'pppppppp-0000-0000-0000-000000000001';
const PRESCRIPTION_ID = 'rrrrrrrr-0000-0000-0000-000000000001';
const now = new Date('2026-06-01T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makePrescription(
  overrides: Partial<ConstructorParameters<typeof Prescription>[0]> = {},
): Prescription {
  return Prescription.create({
    id: PRESCRIPTION_ID,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationId: null,
    medication: 'Metformin',
    dosage: '500mg',
    frequency: 'twice daily',
    duration: '30 days',
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('PrescriptionsController', () => {
  let controller: PrescriptionsController;

  const mockCreate = { execute: jest.fn() };
  const mockGetPatient = { execute: jest.fn() };
  const mockGetById = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PrescriptionsController],
      providers: [
        { provide: CreatePrescriptionUseCase, useValue: mockCreate },
        { provide: GetPatientPrescriptionsUseCase, useValue: mockGetPatient },
        { provide: GetPrescriptionByIdUseCase, useValue: mockGetById },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<PrescriptionsController>(PrescriptionsController);
  });

  describe('getPatientHistory', () => {
    it('returns prescriptions for a patient', async () => {
      const prescription = makePrescription();
      mockGetPatient.execute.mockResolvedValue([prescription]);

      const result = await controller.getPatientHistory(PATIENT_ID, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('passes doctorId from authenticated user', async () => {
      mockGetPatient.execute.mockResolvedValue([]);

      await controller.getPatientHistory(PATIENT_ID, mockUser);

      expect(mockGetPatient.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, patientId: PATIENT_ID }),
      );
    });

    it('returns an empty array when no prescriptions exist', async () => {
      mockGetPatient.execute.mockResolvedValue([]);

      const result = await controller.getPatientHistory(PATIENT_ID, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('returns a single prescription', async () => {
      const prescription = makePrescription();
      mockGetById.execute.mockResolvedValue(prescription);

      const result = await controller.findOne(PRESCRIPTION_ID, mockUser);

      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).id).toBe(PRESCRIPTION_ID);
      expect((result.data as Record<string, unknown>).medication).toBe('Metformin');
    });

    it('propagates PrescriptionNotFoundError', async () => {
      mockGetById.execute.mockRejectedValue(new PrescriptionNotFoundError());

      await expect(controller.findOne(PRESCRIPTION_ID, mockUser)).rejects.toThrow(
        PrescriptionNotFoundError,
      );
    });
  });

  describe('create', () => {
    it('creates a prescription and returns it', async () => {
      const prescription = makePrescription();
      mockCreate.execute.mockResolvedValue(prescription);

      const dto = {
        patient_id: PATIENT_ID,
        medication: 'Metformin',
        dosage: '500mg',
      };

      const result = await controller.create(dto, mockUser);

      expect(result.success).toBe(true);
      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID, medication: 'Metformin' }),
      );
    });

    it('uses authenticated user doctorId — not any body field', async () => {
      const prescription = makePrescription();
      mockCreate.execute.mockResolvedValue(prescription);

      await controller.create({ patient_id: PATIENT_ID, medication: 'Aspirin' }, mockUser);

      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });

    it('maps optional dto fields correctly', async () => {
      const prescription = makePrescription();
      mockCreate.execute.mockResolvedValue(prescription);

      await controller.create(
        {
          patient_id: PATIENT_ID,
          medication: 'Metformin',
          frequency: 'twice daily',
          duration: '30 days',
          notes: 'Take with meals',
        },
        mockUser,
      );

      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          frequency: 'twice daily',
          duration: '30 days',
          notes: 'Take with meals',
        }),
      );
    });

    it('maps response with issued_date derived from created_at', async () => {
      const prescription = makePrescription();
      mockCreate.execute.mockResolvedValue(prescription);

      const result = await controller.create(
        { patient_id: PATIENT_ID, medication: 'Aspirin' },
        mockUser,
      );

      expect((result.data as Record<string, unknown>).issued_date).toBe(now.toISOString());
    });
  });
});
