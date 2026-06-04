import { TogglePlanFeatureUseCase } from './toggle-plan-feature.use-case';
import type {
  IAdminRepository,
  PlanFeatureRow,
} from '../../../domain/repositories/admin.repository';

const featureRow: PlanFeatureRow = {
  id: 'feat-1',
  plan: 'basic',
  featureKey: 'agenda',
  featureLabel: 'Agenda de citas',
  enabled: true,
};

const featureRowDisabled: PlanFeatureRow = { ...featureRow, enabled: false };

const makeRepo = (returnValue: PlanFeatureRow = featureRow): jest.Mocked<IAdminRepository> =>
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
    upsertPlanFeature: jest.fn().mockResolvedValue(returnValue),
    getPatientStats: jest.fn(),
    getSettings: jest.fn(),
    upsertSetting: jest.fn(),
    updatePlan: jest.fn(),
    listAdminUsers: jest.fn(),
    findProfileById: jest.fn(),
    countSuperAdmins: jest.fn(),
    setUserRole: jest.fn(),
  }) as jest.Mocked<IAdminRepository>;

const makeRedis = () => ({
  del: jest.fn().mockResolvedValue(1),
});

describe('TogglePlanFeatureUseCase', () => {
  it('enables a feature for a plan', async () => {
    const repo = makeRepo(featureRow);
    const redis = makeRedis();
    const useCase = new TogglePlanFeatureUseCase(repo, redis as never);

    const result = await useCase.execute({
      planKey: 'basic',
      featureKey: 'agenda',
      featureLabel: 'Agenda de citas',
      enabled: true,
    });

    expect(result.enabled).toBe(true);
    expect(repo.upsertPlanFeature).toHaveBeenCalledWith('basic', 'agenda', 'Agenda de citas', true);
  });

  it('disables a feature for a plan', async () => {
    const repo = makeRepo(featureRowDisabled);
    const redis = makeRedis();
    const useCase = new TogglePlanFeatureUseCase(repo, redis as never);

    const result = await useCase.execute({
      planKey: 'basic',
      featureKey: 'agenda',
      featureLabel: 'Agenda de citas',
      enabled: false,
    });

    expect(result.enabled).toBe(false);
    expect(repo.upsertPlanFeature).toHaveBeenCalledWith(
      'basic',
      'agenda',
      'Agenda de citas',
      false,
    );
  });

  it('invalidates feature cache in Redis after upsert', async () => {
    const repo = makeRepo();
    const redis = makeRedis();
    const useCase = new TogglePlanFeatureUseCase(repo, redis as never);

    await useCase.execute({
      planKey: 'professional',
      featureKey: 'crm',
      featureLabel: 'CRM',
      enabled: true,
    });

    expect(redis.del).toHaveBeenCalledWith('features:professional');
  });

  it('still returns result when Redis.del throws (Redis down)', async () => {
    const repo = makeRepo(featureRow);
    const redis = { del: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const useCase = new TogglePlanFeatureUseCase(repo, redis as never);

    // Should not throw — Redis failure is best-effort
    const result = await useCase.execute({
      planKey: 'basic',
      featureKey: 'agenda',
      featureLabel: 'Agenda de citas',
      enabled: true,
    });

    expect(result).toEqual(featureRow);
  });
});
