import { GetRecentDoctorsUseCase } from './get-recent-doctors.use-case';
import type {
  IAdminRepository,
  RecentDoctorRow,
} from '../../../domain/repositories/admin.repository';

const makeDoctor = (id: string): RecentDoctorRow => ({
  id,
  fullName: `Dr. ${id}`,
  email: `${id}@clinic.com`,
  createdAt: new Date('2026-06-01'),
});

const makeRepo = (rows: RecentDoctorRow[] = []): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    getDashboardOverview: jest.fn(),
    getRecentDoctors: jest.fn().mockResolvedValue(rows),
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
    listPlansWithDetails: jest.fn(),
    createPlan: jest.fn(),
    setPlanFeatures: jest.fn(),
    listPlanPrices: jest.fn(),
    upsertPlanPrice: jest.fn(),
    setPlanPrices: jest.fn(),
    findPermanentPlanForRole: jest.fn(),
  }) as jest.Mocked<IAdminRepository>;

describe('GetRecentDoctorsUseCase', () => {
  it('uses default 7 days when no input is provided', async () => {
    const repo = makeRepo([makeDoctor('d1')]);
    const useCase = new GetRecentDoctorsUseCase(repo);

    await useCase.execute();

    expect(repo.getRecentDoctors).toHaveBeenCalledWith(7);
  });

  it('passes the provided days value to the repo', async () => {
    const repo = makeRepo([]);
    const useCase = new GetRecentDoctorsUseCase(repo);

    await useCase.execute({ days: 14 });

    expect(repo.getRecentDoctors).toHaveBeenCalledWith(14);
  });

  it('clamps days to maximum 30', async () => {
    const repo = makeRepo([]);
    const useCase = new GetRecentDoctorsUseCase(repo);

    await useCase.execute({ days: 99 });

    expect(repo.getRecentDoctors).toHaveBeenCalledWith(30);
  });

  it('clamps days to minimum 1', async () => {
    const repo = makeRepo([]);
    const useCase = new GetRecentDoctorsUseCase(repo);

    await useCase.execute({ days: 0 });

    expect(repo.getRecentDoctors).toHaveBeenCalledWith(1);
  });

  it('returns the rows from the repository', async () => {
    const doctors = [makeDoctor('d1'), makeDoctor('d2')];
    const repo = makeRepo(doctors);
    const useCase = new GetRecentDoctorsUseCase(repo);

    const result = await useCase.execute({ days: 7 });

    expect(result).toHaveLength(2);
    expect(result[0]?.fullName).toBe('Dr. d1');
  });

  it('returns empty array when no recent doctors exist', async () => {
    const repo = makeRepo([]);
    const useCase = new GetRecentDoctorsUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
