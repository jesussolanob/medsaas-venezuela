import { GetPatientsStatsUseCase } from './get-patients-stats.use-case';
import type { IAdminRepository, PatientStats } from '../../../domain/repositories/admin.repository';

const stats: PatientStats = {
  totalPatients: 250,
  patientsByDoctor: [{ doctorId: 'doc-1', count: 100 }],
  totalConsultations: 180,
  totalAppointments: 320,
  activePatientsLast30Days: 45,
  avgAge: 38,
};

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
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
    getPatientStats: jest.fn().mockResolvedValue(stats),
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
  }) as jest.Mocked<IAdminRepository>;

describe('GetPatientsStatsUseCase', () => {
  it('returns global patient stats without PII', async () => {
    const repo = makeRepo();
    const useCase = new GetPatientsStatsUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual(stats);
    expect(repo.getPatientStats).toHaveBeenCalledTimes(1);
  });

  it('result contains no patient names or cedulas (no PII)', async () => {
    const repo = makeRepo();
    const useCase = new GetPatientsStatsUseCase(repo);

    const result = await useCase.execute();

    // Only aggregated counts — no PII fields
    expect(result).not.toHaveProperty('names');
    expect(result).not.toHaveProperty('cedulas');
    expect(result).not.toHaveProperty('emails');
    expect(result).toHaveProperty('totalPatients');
    expect(result).toHaveProperty('patientsByDoctor');
  });

  it('returns totalConsultations aggregate', async () => {
    const repo = makeRepo();
    const useCase = new GetPatientsStatsUseCase(repo);

    const result = await useCase.execute();

    expect(result.totalConsultations).toBe(180);
  });

  it('returns totalAppointments aggregate', async () => {
    const repo = makeRepo();
    const useCase = new GetPatientsStatsUseCase(repo);

    const result = await useCase.execute();

    expect(result.totalAppointments).toBe(320);
  });

  it('returns activePatientsLast30Days aggregate', async () => {
    const repo = makeRepo();
    const useCase = new GetPatientsStatsUseCase(repo);

    const result = await useCase.execute();

    expect(result.activePatientsLast30Days).toBe(45);
  });

  it('returns avgAge aggregate as integer', async () => {
    const repo = makeRepo();
    const useCase = new GetPatientsStatsUseCase(repo);

    const result = await useCase.execute();

    expect(result.avgAge).toBe(38);
    expect(Number.isInteger(result.avgAge)).toBe(true);
  });

  it('returns avgAge 0 when no valid birth_date rows', async () => {
    const repoNoAge = {
      ...makeRepo(),
      getPatientStats: jest.fn().mockResolvedValue({ ...stats, avgAge: 0 }),
    } as jest.Mocked<IAdminRepository>;
    const useCase = new GetPatientsStatsUseCase(repoNoAge);

    const result = await useCase.execute();

    expect(result.avgAge).toBe(0);
  });

  it('result shape contains all expected aggregate keys without PII', async () => {
    const repo = makeRepo();
    const useCase = new GetPatientsStatsUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveProperty('totalPatients');
    expect(result).toHaveProperty('patientsByDoctor');
    expect(result).toHaveProperty('totalConsultations');
    expect(result).toHaveProperty('totalAppointments');
    expect(result).toHaveProperty('activePatientsLast30Days');
    expect(result).toHaveProperty('avgAge');
    // Confirm no individual patient identifiers leak into the aggregate
    expect(result).not.toHaveProperty('fullName');
    expect(result).not.toHaveProperty('cedula');
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('email');
  });
});
