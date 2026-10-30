import { GetDoctorDetailUseCase } from './get-doctor-detail.use-case';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type { IAdminRepository, DoctorDetail } from '../../../domain/repositories/admin.repository';
import type { GetFinancialSummaryUseCase } from '../../../../finances/application/use-cases/finances/get-financial-summary.use-case';

// The repo returns consultation/patient counts; monthlyRevenue is a placeholder (0)
// because GetDoctorDetailUseCase always replaces it with GetFinancialSummaryUseCase.
const doctorDetail: DoctorDetail = {
  id: 'doc-1',
  fullName: 'Dr. House',
  email: 'house@test.com',
  specialty: null,
  phone: null,
  cedula: null,
  city: null,
  state: null,
  isActive: true,
  deactivatedBy: null,
  deactivatedAt: null,
  deactivationReason: null,
  createdAt: new Date('2025-01-01'),
  subscriptionStatus: 'active',
  subscriptionPlan: 'professional',
  subscriptionExpiresAt: null,
  activityStatus: 'inactive',
  lastSignInAt: null,
  patientCount: 10,
  consultationCount: 3,
  monthlyRevenue: 0, // placeholder — overridden by GetFinancialSummaryUseCase
  soldById: null,
  soldByName: null,
  soldBySource: null,
};

/** Returns a jest mock for GetFinancialSummaryUseCase with a given totalIncome. */
const makeFinanceUseCase = (totalIncome: number): jest.Mocked<GetFinancialSummaryUseCase> =>
  ({
    execute: jest.fn().mockResolvedValue({
      totalIncome,
      totalExpenses: 0,
      net: totalIncome,
      consultationCount: 0,
      pendingAmount: 0,
      netBS: null,
      currency: 'USD',
      rateUsed: null,
      month: '2026-10',
      incomeBreakdown: {
        consultationsApproved: totalIncome,
        consultationsPending: 0,
        manualIncome: 0,
      },
      expenseBreakdown: {
        rent: 0,
        staff: 0,
        supplies: 0,
        services: 0,
        taxes: 0,
        other: 0,
      },
    }),
  }) as unknown as jest.Mocked<GetFinancialSummaryUseCase>;

const makeRepo = (returnValue: DoctorDetail | null = doctorDetail): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    findDoctorDetail: jest.fn().mockResolvedValue(returnValue),
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

describe('GetDoctorDetailUseCase', () => {
  it('returns monthlyRevenue from GetFinancialSummaryUseCase, not from the repo', async () => {
    const repo = makeRepo(doctorDetail);
    const finance = makeFinanceUseCase(280);
    const useCase = new GetDoctorDetailUseCase(repo, finance);

    const result = await useCase.execute({ doctorId: 'doc-1' });

    expect(result.monthlyRevenue).toBe(280);
    expect(repo.findDoctorDetail).toHaveBeenCalledWith('doc-1');
    expect(finance.execute).toHaveBeenCalledWith({ doctorId: 'doc-1' });
  });

  it('passes patientCount and consultationCount from the admin repo unchanged', async () => {
    const repo = makeRepo(doctorDetail);
    const useCase = new GetDoctorDetailUseCase(repo, makeFinanceUseCase(100));

    const result = await useCase.execute({ doctorId: 'doc-1' });

    expect(result.patientCount).toBe(10);
    expect(result.consultationCount).toBe(3);
  });

  it('includes profile extension fields in the returned detail', async () => {
    const withFields: DoctorDetail = {
      ...doctorDetail,
      phone: '+58 412 123 4567',
      cedula: '12345678',
      city: 'Caracas',
      state: 'Distrito Capital',
    };
    const repo = makeRepo(withFields);
    const useCase = new GetDoctorDetailUseCase(repo, makeFinanceUseCase(0));

    const result = await useCase.execute({ doctorId: 'doc-1' });

    expect(result.phone).toBe('+58 412 123 4567');
    expect(result.cedula).toBe('12345678');
    expect(result.city).toBe('Caracas');
    expect(result.state).toBe('Distrito Capital');
  });

  it('throws DoctorNotFoundError when doctor does not exist', async () => {
    const repo = makeRepo(null);
    const useCase = new GetDoctorDetailUseCase(repo, makeFinanceUseCase(0));

    await expect(useCase.execute({ doctorId: 'missing' })).rejects.toThrow(DoctorNotFoundError);
  });

  it('counts manual income and orphan payments that the old SQL-only approach missed', async () => {
    // Scenario that caused the bug: 22 appointments, but admin showed only $135.
    // The finance use case sums three sources:
    //   - $135 approved consultation amounts (what the old SQL counted alone)
    //   - $40  manual income (financial_transactions type='income')
    //   - $105 package/quote payment with no linked consultation (orphan payment)
    //         = $280 total — what the doctor's Finanzas screen shows
    const detailWithPlaceholder: DoctorDetail = { ...doctorDetail, monthlyRevenue: 0 };
    const repo = makeRepo(detailWithPlaceholder);
    const finance = makeFinanceUseCase(280); // 135 + 40 + 105

    const useCase = new GetDoctorDetailUseCase(repo, finance);
    const result = await useCase.execute({ doctorId: 'doc-1' });

    // Admin must show 280 (consistent with Finanzas), not the old 135.
    expect(result.monthlyRevenue).toBe(280);
  });
});
