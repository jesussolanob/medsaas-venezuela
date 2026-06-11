import { SetPlanFeaturesUseCase } from './set-plan-features.use-case';
import type {
  IAdminRepository,
  PlanFeatureRow,
} from '../../../domain/repositories/admin.repository';
import { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';

describe('SetPlanFeaturesUseCase', () => {
  let useCase: SetPlanFeaturesUseCase;
  let mockRepo: jest.Mocked<Pick<IAdminRepository, 'findPlanByKey' | 'setPlanFeatures'>>;

  const PLAN_KEY = 'delta_base';
  const features = [
    { featureKey: 'dashboard', featureLabel: 'Dashboard', enabled: true },
    { featureKey: 'ai_assistant', featureLabel: 'Asistente IA', enabled: false },
  ];

  beforeEach(() => {
    mockRepo = {
      findPlanByKey: jest.fn(),
      setPlanFeatures: jest.fn(),
    };
    useCase = new SetPlanFeaturesUseCase(mockRepo as unknown as IAdminRepository);
  });

  it('sets features for an existing plan', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );
    const expected: PlanFeatureRow[] = features.map((f, i) => ({
      id: `id-${i}`,
      plan: PLAN_KEY,
      ...f,
    }));
    mockRepo.setPlanFeatures.mockResolvedValue(expected);

    const result = await useCase.execute({ planKey: PLAN_KEY, features });

    expect(result).toBe(expected);
    expect(mockRepo.findPlanByKey).toHaveBeenCalledWith(PLAN_KEY);
    expect(mockRepo.setPlanFeatures).toHaveBeenCalledWith(PLAN_KEY, features);
  });

  it('throws PlanNotFoundError when plan does not exist', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(null);

    await expect(useCase.execute({ planKey: 'unknown', features })).rejects.toBeInstanceOf(
      PlanNotFoundError,
    );
    expect(mockRepo.setPlanFeatures).not.toHaveBeenCalled();
  });

  it('returns empty array when features input is empty', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );
    mockRepo.setPlanFeatures.mockResolvedValue([]);

    const result = await useCase.execute({ planKey: PLAN_KEY, features: [] });
    expect(result).toEqual([]);
  });
});
