import { GetFinanceStatsUseCase } from './get-finance-stats.use-case';
import type {
  ISubscriptionPaymentRepository,
  FinanceStats,
} from '../../../domain/repositories/subscription-payment.repository';

const makeStats = (): FinanceStats => ({
  mtdRevenue: 300,
  prevMtdRevenue: 200,
  momChange: 50,
  pendingTotal: 150,
  pendingCount: 3,
  totalApproved: 10,
  monthBuckets: [
    { label: 'Ene', total: 0 },
    { label: 'Feb', total: 100 },
    { label: 'Mar', total: 200 },
    { label: 'Abr', total: 150 },
    { label: 'May', total: 200 },
    { label: 'Jun', total: 300 },
  ],
  recentApproved: [
    { id: 'p1', doctorName: 'Dr. Ana', amountUsd: 50, method: 'Zelle', reviewedAt: new Date() },
  ],
  pendingPayments: [
    {
      id: 'p2',
      doctorName: 'Dr. Pedro',
      specialty: 'Cardiología',
      amountUsd: 50,
      method: 'Transferencia',
      createdAt: new Date(),
    },
  ],
});

const makeRepo = (): jest.Mocked<ISubscriptionPaymentRepository> =>
  ({
    list: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
    approveAndExtend: jest.fn(),
    saveApprovedAndExtend: jest.fn(),
    reject: jest.fn(),
    getFinanceStats: jest.fn().mockResolvedValue(makeStats()),
  }) as jest.Mocked<ISubscriptionPaymentRepository>;

const makeRedis = (cachedValue: string | null = null) => ({
  get: jest.fn().mockResolvedValue(cachedValue),
  set: jest.fn().mockResolvedValue('OK'),
});

describe('GetFinanceStatsUseCase', () => {
  it('fetches data from repo and caches it when Redis is empty', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetFinanceStatsUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.mtdRevenue).toBe(300);
    expect(result.momChange).toBe(50);
    expect(repo.getFinanceStats).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith('admin:finance-stats', expect.any(String), 'EX', 120);
  });

  it('returns from cache and skips repo when cache hit', async () => {
    const stats = makeStats();
    const repo = makeRepo();
    const redis = makeRedis(JSON.stringify(stats));
    const useCase = new GetFinanceStatsUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.mtdRevenue).toBe(300);
    expect(repo.getFinanceStats).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith('admin:finance-stats');
  });

  it('falls back to DB when Redis.get throws', async () => {
    const repo = makeRepo();
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const useCase = new GetFinanceStatsUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.mtdRevenue).toBe(300);
    expect(repo.getFinanceStats).toHaveBeenCalledTimes(1);
  });

  it('returns DB data even when Redis.set throws', async () => {
    const repo = makeRepo();
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const useCase = new GetFinanceStatsUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.pendingCount).toBe(3);
  });

  it('exposes correct month buckets structure', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetFinanceStatsUseCase(repo, redis as never);

    const result = await useCase.execute();

    expect(result.monthBuckets).toHaveLength(6);
    expect(result.monthBuckets[0]).toHaveProperty('label');
    expect(result.monthBuckets[0]).toHaveProperty('total');
  });

  it('exposes recentApproved and pendingPayments', async () => {
    const repo = makeRepo();
    const redis = makeRedis(null);
    const useCase = new GetFinanceStatsUseCase(repo, redis as never);

    const result = await useCase.execute();

    const firstApproved = result.recentApproved[0];
    const firstPending = result.pendingPayments[0];
    expect(firstApproved?.doctorName).toBe('Dr. Ana');
    expect(firstPending?.specialty).toBe('Cardiología');
  });
});
