import { GetDashboardOverviewUseCase } from './get-dashboard-overview.use-case';
import type {
  IAdminRepository,
  DashboardOverview,
} from '../../../domain/repositories/admin.repository';

const overviewData: DashboardOverview = {
  appointmentsToday: 5,
  appointmentsThisMonth: 42,
  activeSubscriptions: 20,
  trialSubscriptions: 8,
  recentDoctors: [
    {
      id: 'doc-1',
      fullName: 'Dr. García',
      specialty: 'Cardiología',
      subscriptionStatus: 'active',
      createdAt: new Date('2026-06-01'),
    },
  ],
};

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    getDashboardOverview: jest.fn().mockResolvedValue(overviewData),
    getRecentDoctors: jest.fn(),
    listPlansWithDetails: jest.fn(),
    createPlan: jest.fn(),
    setPlanFeatures: jest.fn(),
    listPlanPrices: jest.fn(),
    upsertPlanPrice: jest.fn(),
    setPlanPrices: jest.fn(),
    findPermanentPlanForRole: jest.fn(),
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
    exportDoctors: jest.fn(),
    getPublicStats: jest.fn(),
    setProfileActive: jest.fn(),
  }) as jest.Mocked<IAdminRepository>;

const makeRedis = (cachedValue: string | null = null) => ({
  get: jest.fn().mockResolvedValue(cachedValue),
  set: jest.fn().mockResolvedValue('OK'),
});

describe('GetDashboardOverviewUseCase', () => {
  it('fetches from repo and caches when Redis is empty', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetDashboardOverviewUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result).toEqual(overviewData);
    expect(repo.getDashboardOverview).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'admin:dashboard:overview',
      JSON.stringify(overviewData),
      'EX',
      120,
    );
  });

  it('returns from cache when cache hit', async () => {
    const repo = makeRepo();
    const redis = makeRedis(JSON.stringify(overviewData));
    const useCase = new GetDashboardOverviewUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.appointmentsToday).toBe(5);
    expect(repo.getDashboardOverview).not.toHaveBeenCalled();
  });

  it('falls back to DB when Redis.get throws', async () => {
    const repo = makeRepo();
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const useCase = new GetDashboardOverviewUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result).toEqual(overviewData);
    expect(repo.getDashboardOverview).toHaveBeenCalledTimes(1);
  });

  it('returns DB data even when Redis.set throws', async () => {
    const repo = makeRepo();
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const useCase = new GetDashboardOverviewUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.activeSubscriptions).toBe(20);
  });

  it('exposes recentDoctors list', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetDashboardOverviewUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.recentDoctors).toHaveLength(1);
    const firstDoctor = result.recentDoctors[0];
    expect(firstDoctor?.fullName).toBe('Dr. García');
  });
});
