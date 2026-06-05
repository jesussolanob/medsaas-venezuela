import { TogglePlanUseCase } from './toggle-plan.use-case';
import { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';
import type { IAdminRepository } from '../../../domain/repositories/admin.repository';

const basicPlan = new PlanConfig('basic', 'Basic', 10, 0, true, null, 1);
const basicPlanDisabled = new PlanConfig('basic', 'Basic', 10, 0, false, null, 1);

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
    togglePlan: jest.fn().mockResolvedValue(basicPlanDisabled),
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
  }) as jest.Mocked<IAdminRepository>;

describe('TogglePlanUseCase', () => {
  it('deactivates a plan when isActive is false', async () => {
    const repo = makeRepo();
    const useCase = new TogglePlanUseCase(repo);

    const result = await useCase.execute({ planKey: 'basic', isActive: false });

    expect(repo.togglePlan).toHaveBeenCalledWith('basic', false);
    expect(result.isActive).toBe(false);
  });

  it('activates a plan when isActive is true', async () => {
    const repo = makeRepo(basicPlanDisabled);
    repo.togglePlan.mockResolvedValue(basicPlan);
    const useCase = new TogglePlanUseCase(repo);

    const result = await useCase.execute({ planKey: 'basic', isActive: true });

    expect(result.isActive).toBe(true);
  });

  it('throws PlanNotFoundError when plan does not exist', async () => {
    const repo = makeRepo(null);
    const useCase = new TogglePlanUseCase(repo);

    await expect(useCase.execute({ planKey: 'nonexistent', isActive: false })).rejects.toThrow(
      PlanNotFoundError,
    );
    expect(repo.togglePlan).not.toHaveBeenCalled();
  });
});
