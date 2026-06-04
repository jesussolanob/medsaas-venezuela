import { GetDoctorDetailUseCase } from './get-doctor-detail.use-case';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type { IAdminRepository, DoctorDetail } from '../../../domain/repositories/admin.repository';

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
  createdAt: new Date('2025-01-01'),
  subscriptionStatus: 'active',
  subscriptionPlan: 'professional',
  subscriptionExpiresAt: null,
  activityStatus: 'inactive',
  lastSignInAt: null,
  patientCount: 10,
  consultationCount: 3,
  monthlyRevenue: 150,
};

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
  }) as jest.Mocked<IAdminRepository>;

describe('GetDoctorDetailUseCase', () => {
  it('returns doctor detail when found', async () => {
    const repo = makeRepo(doctorDetail);
    const useCase = new GetDoctorDetailUseCase(repo);

    const result = await useCase.execute({ doctorId: 'doc-1' });

    expect(result).toBe(doctorDetail);
    expect(repo.findDoctorDetail).toHaveBeenCalledWith('doc-1');
  });

  it('includes stats fields in the returned detail', async () => {
    const repo = makeRepo(doctorDetail);
    const useCase = new GetDoctorDetailUseCase(repo);

    const result = await useCase.execute({ doctorId: 'doc-1' });

    expect(result.patientCount).toBe(10);
    expect(result.consultationCount).toBe(3);
    expect(result.monthlyRevenue).toBe(150);
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
    const useCase = new GetDoctorDetailUseCase(repo);

    const result = await useCase.execute({ doctorId: 'doc-1' });

    expect(result.phone).toBe('+58 412 123 4567');
    expect(result.cedula).toBe('12345678');
    expect(result.city).toBe('Caracas');
    expect(result.state).toBe('Distrito Capital');
  });

  it('throws DoctorNotFoundError when doctor does not exist', async () => {
    const repo = makeRepo(null);
    const useCase = new GetDoctorDetailUseCase(repo);

    await expect(useCase.execute({ doctorId: 'missing' })).rejects.toThrow(DoctorNotFoundError);
  });
});
