import { UpdatePromotionUseCase } from './update-promotion.use-case';
import type { IPromotionRepository } from '../../../domain/repositories/promotion.repository';
import { Promotion } from '../../../domain/entities/promotion.entity';
import { PromotionNotFoundError } from '../../../domain/errors/promotion-not-found.error';
import { InvalidPromotionError } from '../../../domain/errors/invalid-promotion.error';

const PROMO_ID = 'pppppppp-0000-0000-0000-000000000001';
const now = new Date('2026-06-04T00:00:00Z');

function makePromotion(
  overrides: Partial<ConstructorParameters<typeof Promotion>[0]> = {},
): Promotion {
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
    ...overrides,
  });
}

describe('UpdatePromotionUseCase', () => {
  let useCase: UpdatePromotionUseCase;
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
    useCase = new UpdatePromotionUseCase(mockRepo);
  });

  it('updates a promotion successfully', async () => {
    const existing = makePromotion();
    const updated = makePromotion({ label: 'Nueva etiqueta' });
    mockRepo.findById.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    const result = await useCase.execute({ promotionId: PROMO_ID, label: 'Nueva etiqueta' });

    expect(result.label).toBe('Nueva etiqueta');
    expect(mockRepo.update).toHaveBeenCalledWith(PROMO_ID, { label: 'Nueva etiqueta' });
  });

  it('throws PromotionNotFoundError when promotion does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ promotionId: PROMO_ID, label: 'X' })).rejects.toThrow(
      PromotionNotFoundError,
    );
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('throws InvalidPromotionError when update makes promo >= original', async () => {
    const existing = makePromotion({ promoPriceUsd: 75, originalPriceUsd: 100 });
    mockRepo.findById.mockResolvedValue(existing);

    await expect(useCase.execute({ promotionId: PROMO_ID, promoPriceUsd: 100 })).rejects.toThrow(
      InvalidPromotionError,
    );
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('throws InvalidPromotionError when update makes original <= existing promo', async () => {
    const existing = makePromotion({ promoPriceUsd: 75, originalPriceUsd: 100 });
    mockRepo.findById.mockResolvedValue(existing);

    await expect(useCase.execute({ promotionId: PROMO_ID, originalPriceUsd: 75 })).rejects.toThrow(
      InvalidPromotionError,
    );
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('throws InvalidPromotionError when update sets duration_months to 0', async () => {
    const existing = makePromotion();
    mockRepo.findById.mockResolvedValue(existing);

    await expect(useCase.execute({ promotionId: PROMO_ID, durationMonths: 0 })).rejects.toThrow(
      InvalidPromotionError,
    );
    expect(mockRepo.update).not.toHaveBeenCalled();
  });

  it('passes partial fields to repository without promotionId key', async () => {
    const existing = makePromotion();
    const updated = makePromotion({ isActive: false });
    mockRepo.findById.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    await useCase.execute({ promotionId: PROMO_ID, isActive: false });

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
    expect(mockRepo.update).toHaveBeenCalledWith(
      PROMO_ID,
      expect.objectContaining({ isActive: false }),
    );
    expect(mockRepo.update).not.toHaveBeenCalledWith(
      PROMO_ID,
      expect.objectContaining({ promotionId: PROMO_ID }),
    );
  });

  it('validates using existing values when only one price field is updated', async () => {
    const existing = makePromotion({ promoPriceUsd: 50, originalPriceUsd: 100 });
    const updated = makePromotion({ promoPriceUsd: 60, originalPriceUsd: 100 });
    mockRepo.findById.mockResolvedValue(existing);
    mockRepo.update.mockResolvedValue(updated);

    // 60 < 100 — valid
    const result = await useCase.execute({ promotionId: PROMO_ID, promoPriceUsd: 60 });
    expect(result.promoPriceUsd).toBe(60);
  });
});
