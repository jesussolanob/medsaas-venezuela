import { SetPlanPricesUseCase } from './set-plan-prices.use-case';
import type {
  IAdminRepository,
  PlanPriceRow,
  SetPlanPriceParams,
} from '../../../domain/repositories/admin.repository';
import { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';

describe('SetPlanPricesUseCase', () => {
  let useCase: SetPlanPricesUseCase;
  let mockRepo: jest.Mocked<Pick<IAdminRepository, 'findPlanByKey' | 'setPlanPrices'>>;

  const PLAN_KEY = 'delta_base';
  const prices = [
    { period: 'monthly' as const, priceUsd: 10, isActive: true },
    { period: 'annual' as const, priceUsd: 96, isActive: true },
  ];

  beforeEach(() => {
    mockRepo = {
      findPlanByKey: jest.fn(),
      setPlanPrices: jest.fn(),
    };
    useCase = new SetPlanPricesUseCase(mockRepo as unknown as IAdminRepository);
  });

  it('sets prices for an existing plan', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );
    const expected: PlanPriceRow[] = prices.map((p, i) => ({
      id: `id-${i}`,
      planKey: PLAN_KEY,
      ...p,
    }));
    mockRepo.setPlanPrices.mockResolvedValue(expected);

    const result = await useCase.execute({ planKey: PLAN_KEY, prices });

    expect(result).toBe(expected);
    expect(mockRepo.findPlanByKey).toHaveBeenCalledWith(PLAN_KEY);

    const expectedParams: SetPlanPriceParams[] = prices.map((p) => ({
      planKey: PLAN_KEY,
      ...p,
    }));
    expect(mockRepo.setPlanPrices).toHaveBeenCalledWith(PLAN_KEY, expectedParams);
  });

  it('throws PlanNotFoundError when plan does not exist', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(null);

    await expect(useCase.execute({ planKey: 'ghost', prices })).rejects.toBeInstanceOf(
      PlanNotFoundError,
    );
    expect(mockRepo.setPlanPrices).not.toHaveBeenCalled();
  });

  it('returns empty array when prices input is empty', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );
    mockRepo.setPlanPrices.mockResolvedValue([]);

    const result = await useCase.execute({ planKey: PLAN_KEY, prices: [] });
    expect(result).toEqual([]);
  });
});
