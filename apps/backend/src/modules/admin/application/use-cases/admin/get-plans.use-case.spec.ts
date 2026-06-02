import { GetPlansUseCase } from './get-plans.use-case';
import { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import type { IAdminRepository } from '../../../domain/repositories/admin.repository';

const plans = [
  new PlanConfig('trial', 'Trial', 0, 14, true, null, 0),
  new PlanConfig('basic', 'Basic', 10, 0, true, null, 1),
];

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    listSubscriptions: jest.fn(),
    updateDoctorSubscription: jest.fn(),
    listPlans: jest.fn().mockResolvedValue(plans),
    findPlanByKey: jest.fn(),
    togglePlan: jest.fn(),
    listPlanFeatures: jest.fn(),
    upsertPlanFeature: jest.fn(),
    getPatientStats: jest.fn(),
    getSettings: jest.fn(),
  }) as jest.Mocked<IAdminRepository>;

describe('GetPlansUseCase', () => {
  it('returns plan list from repo', async () => {
    const repo = makeRepo();
    const useCase = new GetPlansUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result[0]?.planKey).toBe('trial');
    expect(repo.listPlans).toHaveBeenCalledTimes(1);
  });
});
