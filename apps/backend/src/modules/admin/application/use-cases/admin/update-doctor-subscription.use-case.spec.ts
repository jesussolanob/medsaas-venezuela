import { UpdateDoctorSubscriptionUseCase } from './update-doctor-subscription.use-case';
import { DoctorWithActivity } from '../../../domain/entities/doctor-with-activity.entity';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type { IAdminRepository } from '../../../domain/repositories/admin.repository';

const existingDoctor = new DoctorWithActivity(
  'doc-1',
  'Dr. House',
  'house@test.com',
  null,
  'trial',
  'trial',
  null,
  null,
);

const makeRepo = (
  doctor: DoctorWithActivity | null = existingDoctor,
): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
    findDoctorById: jest.fn().mockResolvedValue(doctor),
    findDoctorDetail: jest.fn(),
    getDoctorGrowth: jest.fn(),
    listSubscriptions: jest.fn(),
    updateDoctorSubscription: jest.fn().mockResolvedValue(undefined),
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
  }) as jest.Mocked<IAdminRepository>;

const makeRedis = () => ({
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn(),
  set: jest.fn(),
});

const validInput = {
  doctorId: 'doc-1',
  plan: 'professional' as const,
  status: 'active' as const,
  expiresAt: new Date('2027-01-01'),
  notes: 'Upgraded manually',
};

describe('UpdateDoctorSubscriptionUseCase', () => {
  it('updates subscription when doctor exists', async () => {
    const repo = makeRepo();
    const redis = makeRedis();
    const useCase = new UpdateDoctorSubscriptionUseCase(repo, redis as never);

    await useCase.execute(validInput);

    expect(repo.updateDoctorSubscription).toHaveBeenCalledWith({
      doctorId: 'doc-1',
      plan: 'professional',
      status: 'active',
      expiresAt: validInput.expiresAt,
      notes: 'Upgraded manually',
    });
  });

  it('invalidates dashboard cache after update', async () => {
    const repo = makeRepo();
    const redis = makeRedis();
    const useCase = new UpdateDoctorSubscriptionUseCase(repo, redis as never);

    await useCase.execute(validInput);

    expect(redis.del).toHaveBeenCalledWith('admin:dashboard');
  });

  it('throws DoctorNotFoundError when doctor does not exist', async () => {
    const repo = makeRepo(null);
    const redis = makeRedis();
    const useCase = new UpdateDoctorSubscriptionUseCase(repo, redis as never);

    await expect(useCase.execute(validInput)).rejects.toThrow(DoctorNotFoundError);
    expect(repo.updateDoctorSubscription).not.toHaveBeenCalled();
  });

  it('sets notes to null when not provided', async () => {
    const repo = makeRepo();
    const redis = makeRedis();
    const useCase = new UpdateDoctorSubscriptionUseCase(repo, redis as never);

    await useCase.execute({ ...validInput, notes: undefined });

    expect(repo.updateDoctorSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
    );
  });

  it('still updates subscription when Redis.del throws (Redis down)', async () => {
    const repo = makeRepo();
    const redis = {
      del: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      get: jest.fn(),
      set: jest.fn(),
    };
    const useCase = new UpdateDoctorSubscriptionUseCase(repo, redis as never);

    // Should not throw — Redis failure is best-effort
    await expect(useCase.execute(validInput)).resolves.toBeUndefined();
    expect(repo.updateDoctorSubscription).toHaveBeenCalledTimes(1);
  });
});
