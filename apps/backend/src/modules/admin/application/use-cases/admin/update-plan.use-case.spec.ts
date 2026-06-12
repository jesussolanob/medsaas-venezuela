import { UpdatePlanUseCase } from './update-plan.use-case';
import { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';
import type { IAdminRepository } from '../../../domain/repositories/admin.repository';

const basicPlan = new PlanConfig('basic', 'Basic', 10, 0, true, null, 1);
const updatedPlan = new PlanConfig('basic', 'Basic Plus', 15, 0, true, null, 1);
const updatedWithDescription = new PlanConfig('basic', 'Basic', 10, 0, true, 'Great value plan', 1);

const makeRepo = (plan: PlanConfig | null = basicPlan): jest.Mocked<IAdminRepository> =>
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
    findPlanByKey: jest.fn().mockResolvedValue(plan),
    togglePlan: jest.fn(),
    listPlanFeatures: jest.fn(),
    upsertPlanFeature: jest.fn(),
    getPatientStats: jest.fn(),
    getSettings: jest.fn(),
    upsertSetting: jest.fn(),
    updatePlan: jest.fn().mockResolvedValue(updatedPlan),
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

describe('UpdatePlanUseCase', () => {
  it('updates a plan and returns the updated value object', async () => {
    const repo = makeRepo();
    const useCase = new UpdatePlanUseCase(repo);

    const result = await useCase.execute({ planKey: 'basic', name: 'Basic Plus', price: 15 });

    expect(repo.updatePlan).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: 'basic', name: 'Basic Plus', price: 15 }),
    );
    expect(result.name).toBe('Basic Plus');
    expect(result.priceUsd).toBe(15);
  });

  it('passes only provided fields to the repo (undefined for omitted ones)', async () => {
    const repo = makeRepo();
    const useCase = new UpdatePlanUseCase(repo);

    await useCase.execute({ planKey: 'basic', price: 20 });

    expect(repo.updatePlan).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: 'basic', price: 20, name: undefined }),
    );
  });

  it('throws PlanNotFoundError when plan does not exist', async () => {
    const repo = makeRepo(null);
    const useCase = new UpdatePlanUseCase(repo);

    await expect(useCase.execute({ planKey: 'ghost', price: 5 })).rejects.toThrow(
      PlanNotFoundError,
    );

    expect(repo.updatePlan).not.toHaveBeenCalled();
  });

  it('propagates description string to the repo', async () => {
    const repo = makeRepo();
    repo.updatePlan.mockResolvedValue(updatedWithDescription);
    const useCase = new UpdatePlanUseCase(repo);

    const result = await useCase.execute({ planKey: 'basic', description: 'Great value plan' });

    expect(repo.updatePlan).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: 'basic', description: 'Great value plan' }),
    );
    expect(result.description).toBe('Great value plan');
  });

  it('propagates null description to the repo (clear)', async () => {
    const repo = makeRepo();
    const clearedPlan = new PlanConfig('basic', 'Basic', 10, 0, true, null, 1);
    repo.updatePlan.mockResolvedValue(clearedPlan);
    const useCase = new UpdatePlanUseCase(repo);

    await useCase.execute({ planKey: 'basic', description: null });

    expect(repo.updatePlan).toHaveBeenCalledWith(
      expect.objectContaining({ planKey: 'basic', description: null }),
    );
  });

  it('does not include description in repo call when omitted (undefined)', async () => {
    const repo = makeRepo();
    const useCase = new UpdatePlanUseCase(repo);

    await useCase.execute({ planKey: 'basic', price: 10 });

    const call = repo.updatePlan.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    // description key should be present as undefined (passed through from input)
    expect(call?.description).toBeUndefined();
  });
});
