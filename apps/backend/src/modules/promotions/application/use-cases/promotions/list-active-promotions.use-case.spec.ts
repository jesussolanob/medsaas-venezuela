import { ListActivePromotionsUseCase } from './list-active-promotions.use-case';
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

describe('ListActivePromotionsUseCase', () => {
  let useCase: ListActivePromotionsUseCase;
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
    useCase = new ListActivePromotionsUseCase(mockRepo);
  });

  it('returns active promotions from the repository', async () => {
    const promos = [makePromotion()];
    mockRepo.listActive.mockResolvedValue(promos);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(mockRepo.listActive).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no active promotions exist', async () => {
    mockRepo.listActive.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toHaveLength(0);
  });

  it('delegates filtering to repository — returns whatever the repo returns', async () => {
    const promos = [makePromotion({ planKey: 'premium' }), makePromotion({ planKey: 'basic' })];
    mockRepo.listActive.mockResolvedValue(promos);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(mockRepo.listActive).toHaveBeenCalledTimes(1);
    expect(mockRepo.listAll).not.toHaveBeenCalled();
  });
});
