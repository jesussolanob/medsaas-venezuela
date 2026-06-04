import { GetDoctorsListUseCase } from './get-doctors-list.use-case';
import { DoctorWithActivity } from '../../../domain/entities/doctor-with-activity.entity';
import type {
  IAdminRepository,
  DoctorListResult,
} from '../../../domain/repositories/admin.repository';

const makeDoctor = (
  id: string,
  subscriptionStatus: 'active' | 'trial' | 'past_due' | 'suspended' | 'cancelled' | 'trialing',
): DoctorWithActivity =>
  new DoctorWithActivity(
    id,
    `Doctor ${id}`,
    `${id}@test.com`,
    null,
    subscriptionStatus,
    'basic',
    null,
    null, // lastSignInAt null → activityStatus = 'inactive'
  );

const makeResult = (items: DoctorWithActivity[]): DoctorListResult => ({
  items,
  total: items.length,
  page: 1,
  limit: 20,
});

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest
      .fn()
      .mockResolvedValue(makeResult([makeDoctor('1', 'active'), makeDoctor('2', 'trial')])),
    findDoctorById: jest.fn(),
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
  }) as jest.Mocked<IAdminRepository>;

describe('GetDoctorsListUseCase', () => {
  it('returns paginated list of doctors from the repo', async () => {
    const repo = makeRepo();
    const useCase = new GetDoctorsListUseCase(repo);

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(result.items).toHaveLength(2);
    expect(repo.listDoctors).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      activityStatus: undefined,
      subscriptionStatus: undefined,
    });
  });

  it('passes activityStatus filter to the repo', async () => {
    const repo = makeRepo();
    const useCase = new GetDoctorsListUseCase(repo);

    await useCase.execute({ page: 1, limit: 10, activityStatus: 'inactive' });

    expect(repo.listDoctors).toHaveBeenCalledWith(
      expect.objectContaining({ activityStatus: 'inactive' }),
    );
  });

  it('passes subscriptionStatus filter to the repo', async () => {
    const repo = makeRepo();
    const useCase = new GetDoctorsListUseCase(repo);

    await useCase.execute({ page: 1, limit: 10, subscriptionStatus: 'past_due' });

    expect(repo.listDoctors).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionStatus: 'past_due' }),
    );
  });

  it('all returned doctors without lastSignInAt are classified as inactive', async () => {
    const repo = makeRepo();
    const useCase = new GetDoctorsListUseCase(repo);

    const result = await useCase.execute({ page: 1, limit: 20 });

    for (const doctor of result.items) {
      expect(doctor.activityStatus).toBe('inactive');
    }
  });
});
