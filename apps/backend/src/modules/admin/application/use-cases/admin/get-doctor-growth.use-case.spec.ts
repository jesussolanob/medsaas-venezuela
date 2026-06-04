import { GetDoctorGrowthUseCase } from './get-doctor-growth.use-case';
import type {
  IAdminRepository,
  DoctorGrowthData,
} from '../../../domain/repositories/admin.repository';

const sampleGrowthData: DoctorGrowthData = {
  chartData: [
    { month: '2026-01', count: 2 },
    { month: '2026-02', count: 3 },
    { month: '2026-03', count: 1 },
    { month: '2026-04', count: 4 },
    { month: '2026-05', count: 2 },
    { month: '2026-06', count: 5 },
  ],
  newThisMonth: 5,
  momGrowth: 150,
};

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    findDoctorDetail: jest.fn(),
    getDoctorGrowth: jest.fn().mockResolvedValue(sampleGrowthData),
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

describe('GetDoctorGrowthUseCase', () => {
  it('returns data from DB and caches it when cache is empty', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetDoctorGrowthUseCase(repo as never, redis as never);

    const result = await useCase.execute();

    expect(repo.getDoctorGrowth).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'admin:doctor-growth',
      JSON.stringify(sampleGrowthData),
      'EX',
      300,
    );
    expect(result).toEqual(sampleGrowthData);
  });

  it('returns cached data without hitting DB when cache is populated', async () => {
    const repo = makeRepo();
    const redis = makeRedis(JSON.stringify(sampleGrowthData));
    const useCase = new GetDoctorGrowthUseCase(repo as never, redis as never);

    const result = await useCase.execute();

    expect(repo.getDoctorGrowth).not.toHaveBeenCalled();
    expect(result).toEqual(sampleGrowthData);
  });

  it('falls through to DB when Redis.get throws', async () => {
    const repo = makeRepo();
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('Redis down')),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const useCase = new GetDoctorGrowthUseCase(repo as never, redis as never);

    const result = await useCase.execute();

    expect(repo.getDoctorGrowth).toHaveBeenCalledTimes(1);
    expect(result).toEqual(sampleGrowthData);
  });

  it('returns DB data even when Redis.set throws (graceful degradation)', async () => {
    const repo = makeRepo();
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockRejectedValue(new Error('Redis write failed')),
    };
    const useCase = new GetDoctorGrowthUseCase(repo as never, redis as never);

    const result = await useCase.execute();

    expect(result).toEqual(sampleGrowthData);
  });

  it('returned data has 6 chart points', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetDoctorGrowthUseCase(repo as never, redis as never);

    const result = await useCase.execute();

    expect(result.chartData).toHaveLength(6);
  });

  it('newThisMonth equals the count of the last chart point', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetDoctorGrowthUseCase(repo as never, redis as never);

    const result = await useCase.execute();

    expect(result.newThisMonth).toBe(sampleGrowthData.newThisMonth);
  });
});
