import { GetSubscriptionsUseCase } from './get-subscriptions.use-case';
import type {
  IAdminRepository,
  SubscriptionListResult,
} from '../../../domain/repositories/admin.repository';

const result: SubscriptionListResult = {
  items: [
    {
      id: 'sub-1',
      doctorId: 'doc-1',
      doctorName: 'Dr. Test',
      doctorEmail: 'test@dev.com',
      plan: 'basic',
      status: 'active',
      priceUsd: 10,
      currentPeriodEnd: new Date('2026-12-31'),
      trialEndsAt: null,
      createdAt: new Date(),
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    findDoctorDetail: jest.fn(),
    getDoctorGrowth: jest.fn(),
    listSubscriptions: jest.fn().mockResolvedValue(result),
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
    createAdminDoctor: jest.fn(),
    listDoctorPatients: jest.fn(),
    logAdminReveal: jest.fn(),
  }) as jest.Mocked<IAdminRepository>;

describe('GetSubscriptionsUseCase', () => {
  it('returns subscriptions from repo', async () => {
    const repo = makeRepo();
    const useCase = new GetSubscriptionsUseCase(repo);

    const output = await useCase.execute({ page: 1, limit: 20 });

    expect(output).toEqual(result);
    expect(repo.listSubscriptions).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      status: undefined,
      plan: undefined,
    });
  });

  it('passes status and plan filters to repo', async () => {
    const repo = makeRepo();
    const useCase = new GetSubscriptionsUseCase(repo);

    await useCase.execute({ page: 1, limit: 10, status: 'past_due', plan: 'professional' });

    expect(repo.listSubscriptions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'past_due', plan: 'professional' }),
    );
  });
});
