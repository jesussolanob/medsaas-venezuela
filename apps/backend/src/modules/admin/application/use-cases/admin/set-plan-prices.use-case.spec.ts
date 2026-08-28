import { SetPlanPricesUseCase } from './set-plan-prices.use-case';
import type {
  IAdminRepository,
  PlanPriceRow,
  SetPlanPriceParams,
} from '../../../domain/repositories/admin.repository';
import { PlanConfig } from '../../../domain/value-objects/plan-config.vo';
import { PlanNotFoundError } from '../../../domain/errors/plan-not-found.error';
import { CompareAtPriceInvalidError } from '../../../domain/errors/compare-at-price-invalid.error';

describe('SetPlanPricesUseCase', () => {
  let useCase: SetPlanPricesUseCase;
  let mockRepo: jest.Mocked<Pick<IAdminRepository, 'findPlanByKey' | 'setPlanPrices'>>;

  const PLAN_KEY = 'delta_base';
  const prices = [
    { period: 'monthly' as const, priceUsd: 10, isActive: true },
    { period: 'annual' as const, priceUsd: 96, isActive: true },
  ];

  function makePlanPriceRow(overrides: Partial<PlanPriceRow> = {}): PlanPriceRow {
    return {
      id: 'row-id',
      planKey: PLAN_KEY,
      period: 'monthly',
      priceUsd: 10,
      isActive: true,
      compareAtPrice: null,
      ...overrides,
    };
  }

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
      compareAtPrice: null,
      ...p,
    }));
    mockRepo.setPlanPrices.mockResolvedValue(expected);

    const result = await useCase.execute({ planKey: PLAN_KEY, prices });

    expect(result).toBe(expected);
    expect(mockRepo.findPlanByKey).toHaveBeenCalledWith(PLAN_KEY);

    const expectedParams: SetPlanPriceParams[] = prices.map((p) => ({
      planKey: PLAN_KEY,
      compareAtPrice: null,
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

  it('passes compareAtPrice to the repository when provided', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );
    const expected = [makePlanPriceRow({ period: 'monthly', priceUsd: 10, compareAtPrice: 20 })];
    mockRepo.setPlanPrices.mockResolvedValue(expected);

    const result = await useCase.execute({
      planKey: PLAN_KEY,
      prices: [{ period: 'monthly', priceUsd: 10, isActive: true, compareAtPrice: 20 }],
    });

    expect(result).toBe(expected);
    const [, params] = mockRepo.setPlanPrices.mock.calls[0]!;
    expect(params[0]).toMatchObject({ compareAtPrice: 20 });
  });

  it('passes compareAtPrice=null when omitted (no promotion)', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );
    mockRepo.setPlanPrices.mockResolvedValue([makePlanPriceRow()]);

    await useCase.execute({
      planKey: PLAN_KEY,
      prices: [{ period: 'monthly', priceUsd: 10, isActive: true }],
    });

    const [, params] = mockRepo.setPlanPrices.mock.calls[0]!;
    expect(params[0]).toMatchObject({ compareAtPrice: null });
  });

  it('throws CompareAtPriceInvalidError when compareAtPrice equals priceUsd', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );

    await expect(
      useCase.execute({
        planKey: PLAN_KEY,
        prices: [{ period: 'monthly', priceUsd: 10, isActive: true, compareAtPrice: 10 }],
      }),
    ).rejects.toBeInstanceOf(CompareAtPriceInvalidError);
    expect(mockRepo.setPlanPrices).not.toHaveBeenCalled();
  });

  it('throws CompareAtPriceInvalidError when compareAtPrice is less than priceUsd', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );

    await expect(
      useCase.execute({
        planKey: PLAN_KEY,
        prices: [{ period: 'monthly', priceUsd: 10, isActive: true, compareAtPrice: 8 }],
      }),
    ).rejects.toBeInstanceOf(CompareAtPriceInvalidError);
    expect(mockRepo.setPlanPrices).not.toHaveBeenCalled();
  });

  it('does not throw when compareAtPrice is null (clearing promotion)', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );
    mockRepo.setPlanPrices.mockResolvedValue([makePlanPriceRow()]);

    await expect(
      useCase.execute({
        planKey: PLAN_KEY,
        prices: [{ period: 'monthly', priceUsd: 10, isActive: true, compareAtPrice: null }],
      }),
    ).resolves.toBeDefined();
  });

  it('validates all price entries independently and fails on the first invalid one', async () => {
    mockRepo.findPlanByKey.mockResolvedValue(
      new PlanConfig(PLAN_KEY, 'Delta Base', 10, 0, true, null, 2),
    );

    await expect(
      useCase.execute({
        planKey: PLAN_KEY,
        prices: [
          { period: 'monthly', priceUsd: 10, isActive: true, compareAtPrice: 20 }, // valid
          { period: 'annual', priceUsd: 96, isActive: true, compareAtPrice: 50 }, // invalid
        ],
      }),
    ).rejects.toBeInstanceOf(CompareAtPriceInvalidError);
    expect(mockRepo.setPlanPrices).not.toHaveBeenCalled();
  });
});
