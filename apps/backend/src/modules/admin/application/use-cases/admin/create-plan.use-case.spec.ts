import { CreatePlanUseCase } from './create-plan.use-case';
import type { IAdminRepository } from '../../../domain/repositories/admin.repository';
import { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanConflictError } from '../../../domain/errors/plan-conflict.error';

function makeMockRepo(): jest.Mocked<Pick<IAdminRepository, 'findPlanByKey' | 'createPlan'>> {
  return {
    findPlanByKey: jest.fn(),
    createPlan: jest.fn(),
  };
}

describe('CreatePlanUseCase', () => {
  let useCase: CreatePlanUseCase;
  let mockRepo: ReturnType<typeof makeMockRepo>;

  const validInput = {
    planKey: 'delta_pro',
    name: 'Delta Pro',
    roleKey: 'doctor',
    isPermanent: false,
    isActive: true,
    sortOrder: 4,
    description: 'Pro plan',
  };

  beforeEach(() => {
    mockRepo = makeMockRepo();
    useCase = new CreatePlanUseCase(mockRepo as unknown as IAdminRepository);
  });

  it('creates a new plan when planKey is unique', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(null);
    const expected = new PlanConfig(
      'delta_pro',
      'Delta Pro',
      0,
      0,
      true,
      'Pro plan',
      4,
      'doctor',
      false,
    );
    mockRepo.createPlan.mockResolvedValue(expected);

    const result = await useCase.execute(validInput);

    expect(result).toBe(expected);
    expect(mockRepo.findPlanByKey).toHaveBeenCalledWith('delta_pro');
    expect(mockRepo.createPlan).toHaveBeenCalledWith({
      planKey: 'delta_pro',
      name: 'Delta Pro',
      roleKey: 'doctor',
      isPermanent: false,
      isActive: true,
      sortOrder: 4,
      description: 'Pro plan',
    });
  });

  it('throws PlanConflictError when plan already exists', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig('delta_pro', 'Delta Pro', 0, 0, true, null, 4),
    );

    await expect(useCase.execute(validInput)).rejects.toBeInstanceOf(PlanConflictError);
    expect(mockRepo.createPlan).not.toHaveBeenCalled();
  });

  it('defaults description to null when not provided', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(null);
    const expected = new PlanConfig('delta_x', 'Delta X', 0, 0, true, null, 1);
    mockRepo.createPlan.mockResolvedValue(expected);

    await useCase.execute({ ...validInput, planKey: 'delta_x', description: undefined });

    expect(mockRepo.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });
});
