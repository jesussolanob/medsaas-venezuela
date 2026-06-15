import { Test, type TestingModule } from '@nestjs/testing';
import { AdminPromotionsController } from './admin-promotions.controller';
import { ListAllPromotionsUseCase } from '../../application/use-cases/promotions/list-all-promotions.use-case';
import { CreatePromotionUseCase } from '../../application/use-cases/promotions/create-promotion.use-case';
import { UpdatePromotionUseCase } from '../../application/use-cases/promotions/update-promotion.use-case';
import { DeletePromotionUseCase } from '../../application/use-cases/promotions/delete-promotion.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { PromotionNotFoundError } from '../../domain/errors/promotion-not-found.error';
import { InvalidPromotionError } from '../../domain/errors/invalid-promotion.error';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

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

describe('AdminPromotionsController', () => {
  let controller: AdminPromotionsController;

  const mockListAll = { execute: jest.fn() };
  const mockCreate = { execute: jest.fn() };
  const mockUpdate = { execute: jest.fn() };
  const mockDelete = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminPromotionsController],
      providers: [
        { provide: ListAllPromotionsUseCase, useValue: mockListAll },
        { provide: CreatePromotionUseCase, useValue: mockCreate },
        { provide: UpdatePromotionUseCase, useValue: mockUpdate },
        { provide: DeletePromotionUseCase, useValue: mockDelete },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AdminPromotionsController>(AdminPromotionsController);
  });

  describe('list', () => {
    it('returns success envelope with all promotions', async () => {
      const promos = [
        makePromotion(),
        makePromotion({ id: 'pppppppp-0000-0000-0000-000000000002', isActive: false }),
      ];
      mockListAll.execute.mockResolvedValue(promos);

      const result = await controller.list();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockListAll.execute).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no promotions exist', async () => {
      mockListAll.execute.mockResolvedValue([]);
      const result = await controller.list();
      expect(result.data).toHaveLength(0);
    });

    it('includes is_active and timestamps in admin response', async () => {
      mockListAll.execute.mockResolvedValue([makePromotion()]);
      const result = await controller.list();
      const item = result.data[0] as Record<string, unknown>;
      expect(item).toHaveProperty('is_active');
      expect(item).toHaveProperty('created_at');
      expect(item).toHaveProperty('updated_at');
    });
  });

  describe('create', () => {
    it('returns the created promotion in a success envelope', async () => {
      const promo = makePromotion();
      mockCreate.execute.mockResolvedValue(promo);

      const result = await controller.create({
        plan_key: 'basic',
        duration_months: 3,
        original_price_usd: 100,
        promo_price_usd: 75,
      });

      expect(result.success).toBe(true);
      expect(mockCreate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ planKey: 'basic', durationMonths: 3 }),
      );
    });

    it('propagates InvalidPromotionError when promo >= original', async () => {
      mockCreate.execute.mockRejectedValue(
        new InvalidPromotionError('promo_price_usd must be less than original_price_usd'),
      );

      await expect(
        controller.create({
          plan_key: 'basic',
          duration_months: 3,
          original_price_usd: 100,
          promo_price_usd: 100,
        }),
      ).rejects.toThrow(InvalidPromotionError);
    });
  });

  describe('update', () => {
    it('returns the updated promotion in a success envelope', async () => {
      const promo = makePromotion({ label: 'Actualizada' });
      mockUpdate.execute.mockResolvedValue(promo);

      const result = await controller.update(PROMO_ID, { label: 'Actualizada' });

      expect(result.success).toBe(true);
      expect(mockUpdate.execute).toHaveBeenCalledWith(
        expect.objectContaining({ promotionId: PROMO_ID }),
      );
    });

    it('propagates PromotionNotFoundError when promotion does not exist', async () => {
      mockUpdate.execute.mockRejectedValue(new PromotionNotFoundError());

      await expect(controller.update(PROMO_ID, { label: 'X' })).rejects.toThrow(
        PromotionNotFoundError,
      );
    });
  });

  describe('remove', () => {
    it('resolves without returning content on success', async () => {
      mockDelete.execute.mockResolvedValue(undefined);

      await expect(controller.remove(PROMO_ID)).resolves.toBeUndefined();
      expect(mockDelete.execute).toHaveBeenCalledWith({ promotionId: PROMO_ID });
    });

    it('propagates PromotionNotFoundError when promotion does not exist', async () => {
      mockDelete.execute.mockRejectedValue(new PromotionNotFoundError());

      await expect(controller.remove(PROMO_ID)).rejects.toThrow(PromotionNotFoundError);
    });
  });
});
