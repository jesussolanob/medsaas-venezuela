import { GetDoctorPatientsUseCase } from './get-doctor-patients.use-case';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type {
  IAdminRepository,
  DoctorPatientRow,
} from '../../../domain/repositories/admin.repository';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DOCTOR_ID = 'doc-uuid-1';
const ACTOR_ID = 'admin-uuid-1';
const ACTOR_ROLE = 'super_admin';

const PATIENT_ROWS: DoctorPatientRow[] = [
  {
    id: 'pat-uuid-1',
    fullName: 'Maria García',
    cedula: 'V-12345678',
    consultationCount: 3,
    lastAttendedAt: new Date('2026-07-01T10:00:00Z'),
  },
  {
    id: 'pat-uuid-2',
    fullName: 'Carlos Rodríguez',
    cedula: null,
    consultationCount: 0,
    lastAttendedAt: null,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRepo(
  overrides: Partial<jest.Mocked<IAdminRepository>> = {},
): jest.Mocked<IAdminRepository> {
  return {
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    findDoctorDetail: jest.fn(),
    getDoctorGrowth: jest.fn(),
    listSubscriptions: jest.fn(),
    updateDoctorSubscription: jest.fn(),
    getSubscriptionSnapshot: jest.fn(),
    applyManualSubscriptionChange: jest.fn(),
    listPlans: jest.fn(),
    findPlanByKey: jest.fn(),
    togglePlan: jest.fn(),
    listPlanFeatures: jest.fn(),
    upsertPlanFeature: jest.fn(),
    getPatientStats: jest.fn(),
    getSettings: jest.fn(),
    upsertSetting: jest.fn(),
    updatePlan: jest.fn(),
    listAdminUsers: jest.fn(),
    findProfileById: jest.fn(),
    countSuperAdmins: jest.fn(),
    setUserRole: jest.fn(),
    getDashboardOverview: jest.fn(),
    getRecentDoctors: jest.fn(),
    listPlansWithDetails: jest.fn(),
    createPlan: jest.fn(),
    setPlanFeatures: jest.fn(),
    listPlanPrices: jest.fn(),
    upsertPlanPrice: jest.fn(),
    setPlanPrices: jest.fn(),
    findPermanentPlanForRole: jest.fn(),
    exportDoctors: jest.fn(),
    getPublicStats: jest.fn(),
    setProfileActive: jest.fn(),
    createAdminDoctor: jest.fn(),
    listDoctorPatients: jest.fn().mockResolvedValue(PATIENT_ROWS),
    logAdminReveal: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<IAdminRepository>;
}

const BASE_INPUT = {
  doctorId: DOCTOR_ID,
  actorId: ACTOR_ID,
  actorRole: ACTOR_ROLE,
  ipAddress: '10.0.0.1',
  userAgent: 'Mozilla/5.0',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GetDoctorPatientsUseCase', () => {
  describe('happy path', () => {
    it('delegates to adminRepo.listDoctorPatients with the doctorId', async () => {
      const repo = makeRepo();
      const useCase = new GetDoctorPatientsUseCase(repo);

      await useCase.execute(BASE_INPUT);

      expect(repo.listDoctorPatients).toHaveBeenCalledTimes(1);
      expect(repo.listDoctorPatients).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('returns the patient rows from the repository', async () => {
      const repo = makeRepo();
      const useCase = new GetDoctorPatientsUseCase(repo);

      const result = await useCase.execute(BASE_INPUT);

      expect(result).toEqual(PATIENT_ROWS);
    });

    it('returns rows with non-medical, non-contact fields only', async () => {
      const repo = makeRepo();
      const useCase = new GetDoctorPatientsUseCase(repo);

      const result = await useCase.execute(BASE_INPUT);

      for (const row of result) {
        // Required identity fields
        expect(typeof row.id).toBe('string');
        expect(typeof row.fullName).toBe('string');
        // Aggregates
        expect(typeof row.consultationCount).toBe('number');
        // No medical or contact fields
        expect(row).not.toHaveProperty('diagnosis');
        expect(row).not.toHaveProperty('treatment');
        expect(row).not.toHaveProperty('phone');
        expect(row).not.toHaveProperty('email');
      }
    });

    it('returns an empty array when the doctor has no patients', async () => {
      const repo = makeRepo({
        listDoctorPatients: jest.fn().mockResolvedValue([]),
      });
      const useCase = new GetDoctorPatientsUseCase(repo);

      const result = await useCase.execute(BASE_INPUT);

      expect(result).toEqual([]);
    });

    it('returns patients with null cedula when cedula is absent', async () => {
      const repo = makeRepo();
      const useCase = new GetDoctorPatientsUseCase(repo);

      const result = await useCase.execute(BASE_INPUT);
      const patientWithoutCedula = result.find((p) => p.id === 'pat-uuid-2');

      expect(patientWithoutCedula).toBeDefined();
      expect(patientWithoutCedula?.cedula).toBeNull();
    });
  });

  describe('audit logging', () => {
    it('inserts one audit row per request', async () => {
      const repo = makeRepo();
      const useCase = new GetDoctorPatientsUseCase(repo);

      await useCase.execute(BASE_INPUT);

      expect(repo.logAdminReveal).toHaveBeenCalledTimes(1);
    });

    it('logs with fieldRevealed=admin_patient_identity', async () => {
      const repo = makeRepo();
      const useCase = new GetDoctorPatientsUseCase(repo);

      await useCase.execute(BASE_INPUT);

      expect(repo.logAdminReveal).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldRevealed: 'admin_patient_identity',
        }),
      );
    });

    it('logs the actorId and actorRole from the input', async () => {
      const repo = makeRepo();
      const useCase = new GetDoctorPatientsUseCase(repo);

      await useCase.execute(BASE_INPUT);

      expect(repo.logAdminReveal).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ACTOR_ID,
          actorRole: ACTOR_ROLE,
        }),
      );
    });

    it('logs the ipAddress and userAgent from the request', async () => {
      const repo = makeRepo();
      const useCase = new GetDoctorPatientsUseCase(repo);

      await useCase.execute(BASE_INPUT);

      expect(repo.logAdminReveal).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.1',
          userAgent: 'Mozilla/5.0',
        }),
      );
    });

    it('still returns patients even when audit log insert fails (fire-and-forget)', async () => {
      const repo = makeRepo({
        logAdminReveal: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      });
      const useCase = new GetDoctorPatientsUseCase(repo);

      // Must NOT throw despite audit failure
      const result = await useCase.execute(BASE_INPUT);

      expect(result).toEqual(PATIENT_ROWS);
    });
  });

  describe('error handling', () => {
    it('propagates DoctorNotFoundError when listDoctorPatients throws it', async () => {
      const repo = makeRepo({
        listDoctorPatients: jest.fn().mockRejectedValue(new DoctorNotFoundError('unknown-id')),
      });
      const useCase = new GetDoctorPatientsUseCase(repo);

      await expect(useCase.execute({ ...BASE_INPUT, doctorId: 'unknown-id' })).rejects.toThrow(
        DoctorNotFoundError,
      );
    });

    it('does NOT call logAdminReveal when listDoctorPatients throws', async () => {
      const repo = makeRepo({
        listDoctorPatients: jest.fn().mockRejectedValue(new DoctorNotFoundError('x')),
      });
      const useCase = new GetDoctorPatientsUseCase(repo);

      await expect(useCase.execute(BASE_INPUT)).rejects.toThrow(DoctorNotFoundError);

      // Audit row must not be written for failed lookups
      expect(repo.logAdminReveal).not.toHaveBeenCalled();
    });
  });
});
