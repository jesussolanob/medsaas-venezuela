import { GetPatientsStatsUseCase } from './get-patients-stats.use-case';
import type { IAdminRepository, PatientStats } from '../../../domain/repositories/admin.repository';

const stats: PatientStats = {
  totalPatients: 250,
  patientsByDoctor: [{ doctorId: 'doc-1', count: 100 }],
};

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    listSubscriptions: jest.fn(),
    updateDoctorSubscription: jest.fn(),
    listPlans: jest.fn(),
    findPlanByKey: jest.fn(),
    togglePlan: jest.fn(),
    listPlanFeatures: jest.fn(),
    upsertPlanFeature: jest.fn(),
    getPatientStats: jest.fn().mockResolvedValue(stats),
    getSettings: jest.fn(),
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

    // Only counts — no PII fields
    expect(result).not.toHaveProperty('names');
    expect(result).not.toHaveProperty('cedulas');
    expect(result).not.toHaveProperty('emails');
    expect(result).toHaveProperty('totalPatients');
    expect(result).toHaveProperty('patientsByDoctor');
  });
});
