import { ListAllPromotionsUseCase } from './list-all-promotions.use-case';
import type { IPromotionRepository } from '../../../domain/repositories/promotion.repository';
import { Promotion } from '../../../domain/entities/promotion.entity';

const now = new Date('2026-06-04T00:00:00Z');

function makePromotion(
  overrides: Partial<ConstructorParameters<typeof Promotion>[0]> = {},
): Promotion {
  return new Promotion({
    id: 'pppppppp-0000-0000-0000-000000000001',
    planKey: 'basic',
    durationMonths: 3,
    originalPriceUsd: 100,
    promoPriceUsd: 75,
    label: 'Oferta 3 meses',
    isActive: true,
    endsAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('ListAllPromotionsUseCase', () => {
  let useCase: ListAllPromotionsUseCase;
  let mockRepo: jest.Mocked<IPromotionRepository>;

  beforeEach(() => {
    mockRepo = {
      listAll: jest.fn(),
      listActive: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new ListAllPromotionsUseCase(mockRepo);
  });

  it('returns all promotions from the repository', async () => {
    const promos = [
      makePromotion(),
      makePromotion({ id: 'pppppppp-0000-0000-0000-000000000002', isActive: false }),
    ];
    mockRepo.listAll.mockResolvedValue(promos);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(mockRepo.listAll).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no promotions exist', async () => {
    mockRepo.listAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toHaveLength(0);
  });

  it('returns both active and inactive promotions', async () => {
    const promos = [
      makePromotion({ isActive: true }),
      makePromotion({ id: 'pppppppp-0000-0000-0000-000000000002', isActive: false }),
    ];
    mockRepo.listAll.mockResolvedValue(promos);

    const result = await useCase.execute();

    expect(result.some((p) => p.isActive === false)).toBe(true);
    expect(result.some((p) => p.isActive === true)).toBe(true);
  });
});
