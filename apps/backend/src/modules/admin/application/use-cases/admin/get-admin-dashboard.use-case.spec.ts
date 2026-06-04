import { GetAdminDashboardUseCase } from './get-admin-dashboard.use-case';
import type {
  IAdminRepository,
  AdminDashboardData,
} from '../../../domain/repositories/admin.repository';

const dashboardData: AdminDashboardData = {
  totalDoctors: 10,
  activeDoctors: 3,
  coldDoctors: 2,
  inactiveDoctors: 5,
  appointmentsLast30Days: 42,
  totalPatients: 150,
  expiringSubscriptionsCount: 2,
};

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn().mockResolvedValue(dashboardData),
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
  }) as jest.Mocked<IAdminRepository>;

const makeRedis = (cachedValue: string | null = null) => ({
  get: jest.fn().mockResolvedValue(cachedValue),
  set: jest.fn().mockResolvedValue('OK'),
});

describe('GetAdminDashboardUseCase', () => {
  it('fetches data from repo and caches it on first call', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetAdminDashboardUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result).toEqual(dashboardData);
    expect(repo.getDashboardData).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'admin:dashboard',
      JSON.stringify(dashboardData),
      'EX',
      300,
    );
  });

  it('returns from cache on second call without hitting the repo', async () => {
    const repo = makeRepo();
    const redis = makeRedis(JSON.stringify(dashboardData));
    const useCase = new GetAdminDashboardUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result).toEqual(dashboardData);
    expect(repo.getDashboardData).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith('admin:dashboard');
  });

  it('returns alerts for expiring subscriptions', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetAdminDashboardUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.expiringSubscriptionsCount).toBe(2);
  });

  it('counts doctors by activity status correctly from repo data', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetAdminDashboardUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.activeDoctors).toBe(3);
    expect(result.coldDoctors).toBe(2);
    expect(result.inactiveDoctors).toBe(5);
    expect(result.totalDoctors).toBe(10);
  });

  it('falls back to DB when Redis.get throws (Redis down)', async () => {
    const repo = makeRepo();
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const useCase = new GetAdminDashboardUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result).toEqual(dashboardData);
    expect(repo.getDashboardData).toHaveBeenCalledTimes(1);
  });

  it('returns DB data even when Redis.set throws (Redis down)', async () => {
    const repo = makeRepo();
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const useCase = new GetAdminDashboardUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result).toEqual(dashboardData);
  });
});
