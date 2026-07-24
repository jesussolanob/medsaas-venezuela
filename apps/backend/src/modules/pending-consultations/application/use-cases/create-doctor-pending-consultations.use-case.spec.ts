import { CreateDoctorPendingConsultationsUseCase } from './create-doctor-pending-consultations.use-case';
import { CreatePendingConsultationsUseCase } from './create-pending-consultations.use-case';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { IPricingPlanRepository } from '../../../packages/domain/repositories/pricing-plan.repository';
import { Patient } from '../../../patients/domain/entities/patient.entity';
import { PricingPlan } from '../../../packages/domain/entities/pricing-plan.entity';
import { PendingConsultation } from '../../domain/entities/pending-consultation.entity';
import { PatientNotOwnedError } from '../../domain/errors/patient-not-owned.error';
import { PlanNotOwnedError } from '../../domain/errors/plan-not-owned.error';

const DOCTOR_ID = 'doc-uuid-1111-2222-3333-444444444444';
const PATIENT_ID = 'pat-uuid-1111-2222-3333-444444444444';
const PLAN_ID = 'plan-uuid-1111-2222-3333-444444444444';

function makePatient(): Patient {
  return Patient.create({
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makePlan(overrides: Partial<{ sessionsCount: number; validityDays: number | null }> = {}) {
  return PricingPlan.create({
    id: PLAN_ID,
    doctorId: DOCTOR_ID,
    officeId: null,
    name: 'Paquete 3 sesiones',
    priceUsd: 90,
    durationMinutes: 30,
    sessionsCount: overrides.sessionsCount ?? 3,
    validityDays: overrides.validityDays ?? null,
    description: null,
    type: 'plan',
    showInBooking: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makePc(sessionNumber: number): PendingConsultation {
  return PendingConsultation.create({
    id: `pc-${sessionNumber}`,
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    planName: 'Paquete 3 sesiones',
    sessionNumber,
    status: 'pending_scheduling',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('CreateDoctorPendingConsultationsUseCase', () => {
  let useCase: CreateDoctorPendingConsultationsUseCase;
  let mockPatientRepo: jest.Mocked<IPatientRepository>;
  let mockPlanRepo: jest.Mocked<IPricingPlanRepository>;
  let mockCreatePendingUC: jest.Mocked<CreatePendingConsultationsUseCase>;

  beforeEach(() => {
    mockPatientRepo = {
      findById: jest.fn(),
      findByCedulaHash: jest.fn(),
      findByEmailHash: jest.fn(),
      list: jest.fn(),
      findAllByDoctor: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      logReveal: jest.fn(),
    };

    mockPlanRepo = {
      findPublicByDoctorId: jest.fn(),
      findAllByDoctorId: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mockCreatePendingUC = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreatePendingConsultationsUseCase>;

    useCase = new CreateDoctorPendingConsultationsUseCase(
      mockPatientRepo,
      mockPlanRepo,
      mockCreatePendingUC,
    );
  });

  describe('happy path', () => {
    it('creates pending consultations and returns them when patient and plan are owned', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockPlanRepo.findById.mockResolvedValue(makePlan());
      const created = [makePc(2), makePc(3)];
      mockCreatePendingUC.execute.mockResolvedValue(created);

      const result = await useCase.execute({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        planId: PLAN_ID,
        sessionNumbers: [2, 3],
      });

      expect(result).toHaveLength(2);
      expect(result[0]?.sessionNumber).toBe(2);
      expect(result[1]?.sessionNumber).toBe(3);
    });

    it('calls patientRepo.findById scoped to doctorId (anti-IDOR)', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockPlanRepo.findById.mockResolvedValue(makePlan());
      mockCreatePendingUC.execute.mockResolvedValue([makePc(2)]);

      await useCase.execute({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        planId: PLAN_ID,
        sessionNumbers: [2],
      });

      expect(mockPatientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
    });

    it('resolves expiresAt from plan.validityDays when set', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockPlanRepo.findById.mockResolvedValue(makePlan({ validityDays: 30 }));
      mockCreatePendingUC.execute.mockResolvedValue([makePc(2)]);

      const before = new Date();
      await useCase.execute({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        planId: PLAN_ID,
        sessionNumbers: [2],
      });

      const callArgs = mockCreatePendingUC.execute.mock.calls[0]?.[0];
      expect(callArgs?.expiresAt).toBeInstanceOf(Date);
      const diffMs = (callArgs?.expiresAt as Date).getTime() - before.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(29.9);
      expect(diffDays).toBeLessThanOrEqual(30.1);
    });

    it('passes null expiresAt when plan.validityDays is null', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockPlanRepo.findById.mockResolvedValue(makePlan({ validityDays: null }));
      mockCreatePendingUC.execute.mockResolvedValue([makePc(2)]);

      await useCase.execute({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        planId: PLAN_ID,
        sessionNumbers: [2],
      });

      const callArgs = mockCreatePendingUC.execute.mock.calls[0]?.[0];
      expect(callArgs?.expiresAt).toBeNull();
    });

    it('passes planName resolved from the plan entity (not from the client)', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockPlanRepo.findById.mockResolvedValue(makePlan());
      mockCreatePendingUC.execute.mockResolvedValue([makePc(2)]);

      await useCase.execute({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        planId: PLAN_ID,
        sessionNumbers: [2],
      });

      const callArgs = mockCreatePendingUC.execute.mock.calls[0]?.[0];
      expect(callArgs?.planName).toBe('Paquete 3 sesiones');
    });

    it('forwards optional fields (paymentId, officeId, appointmentMode)', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockPlanRepo.findById.mockResolvedValue(makePlan());
      mockCreatePendingUC.execute.mockResolvedValue([makePc(2)]);

      await useCase.execute({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        planId: PLAN_ID,
        sessionNumbers: [2],
        paymentId: 'pay-001',
        officeId: 'office-001',
        appointmentMode: 'presencial',
      });

      const callArgs = mockCreatePendingUC.execute.mock.calls[0]?.[0];
      expect(callArgs?.paymentId).toBe('pay-001');
      expect(callArgs?.officeId).toBe('office-001');
      expect(callArgs?.appointmentMode).toBe('presencial');
    });
  });

  describe('anti-IDOR — patient ownership', () => {
    it('throws PatientNotOwnedError when patient does not belong to the doctor', async () => {
      // patientRepo returns null → patient not scoped to this doctor
      mockPatientRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
          planId: PLAN_ID,
          sessionNumbers: [2],
        }),
      ).rejects.toThrow(PatientNotOwnedError);
    });

    it('PatientNotOwnedError carries httpStatus 404 and code PATIENT_NOT_FOUND', async () => {
      mockPatientRepo.findById.mockResolvedValue(null);

      try {
        await useCase.execute({
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
          planId: PLAN_ID,
          sessionNumbers: [2],
        });
      } catch (err) {
        expect((err as PatientNotOwnedError).httpStatus).toBe(404);
        expect((err as PatientNotOwnedError).code).toBe('PATIENT_NOT_FOUND');
      }
    });

    it('does not call pricingPlanRepo when patient check fails', async () => {
      mockPatientRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
          planId: PLAN_ID,
          sessionNumbers: [2],
        }),
      ).rejects.toThrow(PatientNotOwnedError);

      expect(mockPlanRepo.findById).not.toHaveBeenCalled();
      expect(mockCreatePendingUC.execute).not.toHaveBeenCalled();
    });
  });

  describe('anti-IDOR — plan ownership', () => {
    it('throws PlanNotOwnedError when plan does not exist', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockPlanRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
          planId: PLAN_ID,
          sessionNumbers: [2],
        }),
      ).rejects.toThrow(PlanNotOwnedError);
    });

    it('throws PlanNotOwnedError when plan belongs to a different doctor', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      // Plan owned by different doctor
      const otherDoctorPlan = PricingPlan.create({
        id: PLAN_ID,
        doctorId: 'other-doctor-uuid',
        officeId: null,
        name: 'Plan ajeno',
        priceUsd: 90,
        durationMinutes: 30,
        sessionsCount: 3,
        validityDays: null,
        description: null,
        type: 'plan',
        showInBooking: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPlanRepo.findById.mockResolvedValue(otherDoctorPlan);

      await expect(
        useCase.execute({
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
          planId: PLAN_ID,
          sessionNumbers: [2],
        }),
      ).rejects.toThrow(PlanNotOwnedError);
    });

    it('PlanNotOwnedError carries httpStatus 404 and code PLAN_NOT_FOUND', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockPlanRepo.findById.mockResolvedValue(null);

      try {
        await useCase.execute({
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
          planId: PLAN_ID,
          sessionNumbers: [2],
        });
      } catch (err) {
        expect((err as PlanNotOwnedError).httpStatus).toBe(404);
        expect((err as PlanNotOwnedError).code).toBe('PLAN_NOT_FOUND');
      }
    });

    it('does not call createPendingUC when plan check fails', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockPlanRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          doctorId: DOCTOR_ID,
          patientId: PATIENT_ID,
          planId: PLAN_ID,
          sessionNumbers: [2],
        }),
      ).rejects.toThrow(PlanNotOwnedError);

      expect(mockCreatePendingUC.execute).not.toHaveBeenCalled();
    });
  });
});
