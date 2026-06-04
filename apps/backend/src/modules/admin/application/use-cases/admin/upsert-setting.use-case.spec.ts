import { UpsertSettingUseCase } from './upsert-setting.use-case';
import { SettingNotAllowedError } from '../../../domain/errors/setting-not-allowed.error';
import type { IAdminRepository, AppSetting } from '../../../domain/repositories/admin.repository';

const savedSetting: AppSetting = { key: 'app_name', value: 'Delta', updatedAt: new Date() };

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
    listPlanFeatures: jest.fn(),
    upsertPlanFeature: jest.fn(),
    getPatientStats: jest.fn(),
    getSettings: jest.fn(),
    upsertSetting: jest.fn().mockResolvedValue(savedSetting),
    updatePlan: jest.fn(),
    listAdminUsers: jest.fn(),
    findProfileById: jest.fn(),
    countSuperAdmins: jest.fn(),
    setUserRole: jest.fn(),
  }) as jest.Mocked<IAdminRepository>;

describe('UpsertSettingUseCase', () => {
  it('saves an allowed key and returns the setting', async () => {
    const repo = makeRepo();
    const useCase = new UpsertSettingUseCase(repo);

    const result = await useCase.execute({ key: 'app_name', value: 'Delta' });

    expect(repo.upsertSetting).toHaveBeenCalledWith('app_name', 'Delta');
    expect(result).toEqual(savedSetting);
  });

  it('serialised JSON string is stored as-is', async () => {
    const repo = makeRepo();
    repo.upsertSetting.mockResolvedValue({
      key: 'payment_methods_enabled',
      value: '["pago_movil","zelle"]',
      updatedAt: new Date(),
    });
    const useCase = new UpsertSettingUseCase(repo);

    const result = await useCase.execute({
      key: 'payment_methods_enabled',
      value: '["pago_movil","zelle"]',
    });

    expect(result.key).toBe('payment_methods_enabled');
    expect(repo.upsertSetting).toHaveBeenCalledWith(
      'payment_methods_enabled',
      '["pago_movil","zelle"]',
    );
  });

  it('throws SettingNotAllowedError for encryption_key', async () => {
    const repo = makeRepo();
    const useCase = new UpsertSettingUseCase(repo);

    await expect(useCase.execute({ key: 'encryption_key', value: 'hacked' })).rejects.toThrow(
      SettingNotAllowedError,
    );

    expect(repo.upsertSetting).not.toHaveBeenCalled();
  });

  it('throws SettingNotAllowedError for jwt_secret', async () => {
    const repo = makeRepo();
    const useCase = new UpsertSettingUseCase(repo);

    await expect(useCase.execute({ key: 'jwt_secret', value: 'hacked' })).rejects.toThrow(
      SettingNotAllowedError,
    );
  });

  it('throws SettingNotAllowedError for usdt_rate_raw (owned by finances)', async () => {
    const repo = makeRepo();
    const useCase = new UpsertSettingUseCase(repo);

    await expect(useCase.execute({ key: 'usdt_rate_raw', value: '40' })).rejects.toThrow(
      SettingNotAllowedError,
    );

    expect(repo.upsertSetting).not.toHaveBeenCalled();
  });
});
