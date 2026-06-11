import { GetPlanFeaturesUseCase } from './get-plan-features.use-case';
import type {
  IAdminRepository,
  PlanFeatureRow,
} from '../../../domain/repositories/admin.repository';

const features: PlanFeatureRow[] = [
  { id: 'f-1', plan: 'basic', featureKey: 'agenda', featureLabel: 'Agenda', enabled: true },
  { id: 'f-2', plan: 'professional', featureKey: 'crm', featureLabel: 'CRM', enabled: true },
];

const makeRepo = (): jest.Mocked<IAdminRepository> =>
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
    listPlanFeatures: jest.fn().mockResolvedValue(features),
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
  }) as jest.Mocked<IAdminRepository>;

describe('GetPlanFeaturesUseCase', () => {
  it('returns all features when no planKey filter is provided', async () => {
    const repo = makeRepo();
    const useCase = new GetPlanFeaturesUseCase(repo);

    const result = await useCase.execute({});

    expect(result).toHaveLength(2);
    expect(repo.listPlanFeatures).toHaveBeenCalledWith(undefined);
  });

  it('passes planKey filter to repo', async () => {
    const repo = makeRepo();
    const useCase = new GetPlanFeaturesUseCase(repo);

    await useCase.execute({ planKey: 'basic' });

    expect(repo.listPlanFeatures).toHaveBeenCalledWith('basic');
  });
});
