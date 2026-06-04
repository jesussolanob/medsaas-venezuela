import { ListAdminUsersUseCase } from './list-admin-users.use-case';
import type { IAdminRepository, AdminUserRow } from '../../../domain/repositories/admin.repository';

const adminUsers: AdminUserRow[] = [
  {
    id: 'uuid-1',
    fullName: 'Alice Admin',
    email: 'alice@delta.com',
    role: 'super_admin',
    createdAt: new Date(),
  },
  {
    id: 'uuid-2',
    fullName: 'Bob Admin',
    email: 'bob@delta.com',
    role: 'super_admin',
    createdAt: new Date(),
  },
];

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
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
    upsertSetting: jest.fn(),
    updatePlan: jest.fn(),
    listAdminUsers: jest.fn().mockResolvedValue(adminUsers),
    findProfileById: jest.fn(),
    countSuperAdmins: jest.fn(),
    setUserRole: jest.fn(),
  }) as jest.Mocked<IAdminRepository>;

describe('ListAdminUsersUseCase', () => {
  it('returns all admin users from repo', async () => {
    const repo = makeRepo();
    const useCase = new ListAdminUsersUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result[0]?.role).toBe('super_admin');
    expect(repo.listAdminUsers).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no admins exist', async () => {
    const repo = makeRepo();
    repo.listAdminUsers.mockResolvedValue([]);
    const useCase = new ListAdminUsersUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(0);
  });
});
