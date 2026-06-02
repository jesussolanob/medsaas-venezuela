import { GetSettingsUseCase } from './get-settings.use-case';
import type { IAdminRepository, AppSetting } from '../../../domain/repositories/admin.repository';

const settings: AppSetting[] = [
  { key: 'app_name', value: 'Delta Medical', updatedAt: new Date() },
  { key: 'feature_flag_crm', value: 'true', updatedAt: new Date() },
];

const makeRepo = (): jest.Mocked<IAdminRepository> =>
  ({
    getDashboardData: jest.fn(),
    listDoctors: jest.fn(),
    findDoctorById: jest.fn(),
    listSubscriptions: jest.fn(),
    updateDoctorSubscription: jest.fn(),
    listPlans: jest.fn(),
    findPlanByKey: jest.fn(),
    togglePlan: jest.fn(),
    listPlanFeatures: jest.fn(),
    upsertPlanFeature: jest.fn(),
    getPatientStats: jest.fn(),
    getSettings: jest.fn().mockResolvedValue(settings),
  }) as jest.Mocked<IAdminRepository>;

describe('GetSettingsUseCase', () => {
  it('returns app settings from repo', async () => {
    const repo = makeRepo();
    const useCase = new GetSettingsUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual(settings);
    expect(repo.getSettings).toHaveBeenCalledTimes(1);
  });

  it('does not expose secrets — repo filters them', async () => {
    // The filtering of secret keys (encryption_key, jwt_secret) happens in the repo.
    // This test verifies the use case delegates entirely to the repo without modification.
    const repo = makeRepo();
    const useCase = new GetSettingsUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(result.every((s) => s.key !== 'encryption_key')).toBe(true);
  });
});
