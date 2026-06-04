import { GetDoctorDetailUseCase } from './get-doctor-detail.use-case';
import { DoctorWithActivity } from '../../../domain/entities/doctor-with-activity.entity';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type { IAdminRepository } from '../../../domain/repositories/admin.repository';

const doctor = new DoctorWithActivity(
  'doc-1',
  'Dr. House',
  'house@test.com',
  null,
  'active',
  'professional',
  null,
  null,
);

const makeRepo = (returnValue: DoctorWithActivity | null = doctor): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
    findDoctorById: jest.fn().mockResolvedValue(returnValue),
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
  it('returns doctor when found', async () => {
    const repo = makeRepo(doctor);
    const useCase = new GetDoctorDetailUseCase(repo);

    const result = await useCase.execute({ doctorId: 'doc-1' });

    expect(result).toBe(doctor);
    expect(repo.findDoctorById).toHaveBeenCalledWith('doc-1');
  });

  it('throws DoctorNotFoundError when doctor does not exist', async () => {
    const repo = makeRepo(null);
    const useCase = new GetDoctorDetailUseCase(repo);

    await expect(useCase.execute({ doctorId: 'missing' })).rejects.toThrow(DoctorNotFoundError);
  });
});
