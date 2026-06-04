import { Test, type TestingModule } from '@nestjs/testing';
import { PromotionsController } from './promotions.controller';
import { ListActivePromotionsUseCase } from '../../application/use-cases/promotions/list-active-promotions.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';

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

describe('PromotionsController', () => {
  let controller: PromotionsController;
  const mockListActive = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromotionsController],
      providers: [{ provide: ListActivePromotionsUseCase, useValue: mockListActive }],
    }).compile();

    controller = module.get<PromotionsController>(PromotionsController);
  });

  describe('listActivePromotions', () => {
    it('returns success envelope with active promotions', async () => {
      const promos = [makePromotion()];
      mockListActive.execute.mockResolvedValue(promos);

      const result = await controller.listActivePromotions();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockListActive.execute).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no active promotions exist', async () => {
      mockListActive.execute.mockResolvedValue([]);
      const result = await controller.listActivePromotions();
      expect(result.data).toHaveLength(0);
    });

    it('public response does NOT expose is_active, created_at, updated_at', async () => {
      mockListActive.execute.mockResolvedValue([makePromotion()]);
      const result = await controller.listActivePromotions();
      const item = result.data[0] as Record<string, unknown>;
      expect(item).not.toHaveProperty('is_active');
      expect(item).not.toHaveProperty('created_at');
      expect(item).not.toHaveProperty('updated_at');
    });

    it('public response includes expected public fields', async () => {
      mockListActive.execute.mockResolvedValue([makePromotion()]);
      const result = await controller.listActivePromotions();
      const item = result.data[0] as Record<string, unknown>;
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('plan_key');
      expect(item).toHaveProperty('duration_months');
      expect(item).toHaveProperty('original_price_usd');
      expect(item).toHaveProperty('promo_price_usd');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('ends_at');
    });
  });
});
