import { DeletePromotionUseCase } from './delete-promotion.use-case';
import type { IPromotionRepository } from '../../../domain/repositories/promotion.repository';
import { Promotion } from '../../../domain/entities/promotion.entity';
import { PromotionNotFoundError } from '../../../domain/errors/promotion-not-found.error';

const PROMO_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-04T00:00:00Z');

function makePromotion(): Promotion {
  return new Promotion({
    id: PROMO_ID,
    planKey: 'basic',
    durationMonths: 3,
    originalPriceUsd: 100,
    promoPriceUsd: 75,
    label: 'Oferta 3 meses',
    isActive: true,
    endsAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe('DeletePromotionUseCase', () => {
  let useCase: DeletePromotionUseCase;
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
    useCase = new DeletePromotionUseCase(mockRepo);
  });

  it('deletes a promotion successfully when found', async () => {
    mockRepo.findById.mockResolvedValue(makePromotion());
    mockRepo.delete.mockResolvedValue(undefined);

    await expect(useCase.execute({ promotionId: PROMO_ID })).resolves.toBeUndefined();
    expect(mockRepo.delete).toHaveBeenCalledWith(PROMO_ID);
  });

  it('throws PromotionNotFoundError when promotion does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ promotionId: PROMO_ID })).rejects.toThrow(
      PromotionNotFoundError,
    );
    expect(mockRepo.delete).not.toHaveBeenCalled();
  });

  it('calls findById before delete to confirm existence', async () => {
    mockRepo.findById.mockResolvedValue(makePromotion());
    mockRepo.delete.mockResolvedValue(undefined);

    await useCase.execute({ promotionId: PROMO_ID });

    expect(mockRepo.findById).toHaveBeenCalledWith(PROMO_ID);
    expect(mockRepo.findById).toHaveBeenCalledTimes(1);
  });
});
