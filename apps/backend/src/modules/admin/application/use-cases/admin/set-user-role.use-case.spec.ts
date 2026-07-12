import { SetUserRoleUseCase } from './set-user-role.use-case';
import { AdminUserNotFoundError } from '../../../domain/errors/admin-user-not-found.error';
import { LastSuperAdminError } from '../../../domain/errors/last-super-admin.error';
import type { IAdminRepository, AdminUserRow } from '../../../domain/repositories/admin.repository';

const superAdminRow: AdminUserRow = {
  id: 'uuid-admin',
  fullName: 'Alice Admin',
  email: 'alice@delta.com',
  role: 'super_admin',
  createdAt: new Date(),
};

const doctorRow: AdminUserRow = {
  id: 'uuid-doctor',
  fullName: 'Dr House',
  email: 'house@delta.com',
  role: 'doctor',
  createdAt: new Date(),
};

const makeRepo = (
  profile: AdminUserRow | null = superAdminRow,
  superAdminCount = 2,
): jest.Mocked<IAdminRepository> =>
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
    listPlanFeatures: jest.fn(),
    upsertPlanFeature: jest.fn(),
    getPatientStats: jest.fn(),
    getSettings: jest.fn(),
    upsertSetting: jest.fn(),
    updatePlan: jest.fn(),
    listAdminUsers: jest.fn(),
    findProfileById: jest.fn().mockResolvedValue(profile),
    countSuperAdmins: jest.fn().mockResolvedValue(superAdminCount),
    setUserRole: jest.fn().mockResolvedValue(undefined),
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

describe('SetUserRoleUseCase', () => {
  it('promotes a doctor to super_admin', async () => {
    const repo = makeRepo(doctorRow, 2);
    const useCase = new SetUserRoleUseCase(repo);

    await useCase.execute({
      targetUserId: 'uuid-doctor',
      actorUserId: 'uuid-admin',
      newRole: 'super_admin',
    });

    expect(repo.setUserRole).toHaveBeenCalledWith('uuid-doctor', 'super_admin');
  });

  it('demotes a super_admin to doctor when there are multiple admins', async () => {
    const repo = makeRepo(superAdminRow, 3);
    const useCase = new SetUserRoleUseCase(repo);

    await useCase.execute({
      targetUserId: 'uuid-admin',
      actorUserId: 'uuid-other-admin',
      newRole: 'doctor',
    });

    expect(repo.setUserRole).toHaveBeenCalledWith('uuid-admin', 'doctor');
  });

  it('throws AdminUserNotFoundError when target does not exist', async () => {
    const repo = makeRepo(null);
    const useCase = new SetUserRoleUseCase(repo);

    await expect(
      useCase.execute({
        targetUserId: 'nonexistent',
        actorUserId: 'uuid-admin',
        newRole: 'doctor',
      }),
    ).rejects.toThrow(AdminUserNotFoundError);

    expect(repo.setUserRole).not.toHaveBeenCalled();
  });

  it('throws LastSuperAdminError when actor tries to demote themselves', async () => {
    const repo = makeRepo(superAdminRow, 2);
    const useCase = new SetUserRoleUseCase(repo);

    await expect(
      useCase.execute({
        targetUserId: 'uuid-admin',
        actorUserId: 'uuid-admin',
        newRole: 'doctor',
      }),
    ).rejects.toThrow(LastSuperAdminError);

    expect(repo.setUserRole).not.toHaveBeenCalled();
  });

  it('throws LastSuperAdminError when demoting the only remaining super_admin', async () => {
    const repo = makeRepo(superAdminRow, 1);
    const useCase = new SetUserRoleUseCase(repo);

    await expect(
      useCase.execute({
        targetUserId: 'uuid-admin',
        actorUserId: 'uuid-other',
        newRole: 'doctor',
      }),
    ).rejects.toThrow(LastSuperAdminError);

    expect(repo.setUserRole).not.toHaveBeenCalled();
  });

  it('does not check count when target is already a non-super_admin being promoted', async () => {
    const repo = makeRepo(doctorRow, 1);
    const useCase = new SetUserRoleUseCase(repo);

    await useCase.execute({
      targetUserId: 'uuid-doctor',
      actorUserId: 'uuid-admin',
      newRole: 'super_admin',
    });

    // countSuperAdmins is not called when the target is not currently super_admin
    expect(repo.countSuperAdmins).not.toHaveBeenCalled();
    expect(repo.setUserRole).toHaveBeenCalledWith('uuid-doctor', 'super_admin');
  });
});
