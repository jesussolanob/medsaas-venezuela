import { Controller, Get } from '@nestjs/common';
import { ListActivePromotionsUseCase } from '../../application/use-cases/promotions/list-active-promotions.use-case';
import { toPublicPromotionResponse } from '../mappers/promotion.mapper';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Public promotions controller — no auth guard.
 *
 * Returns only active, non-expired promotions for public consumption (e.g. pricing page).
 * The public mapper omits is_active, created_at, updated_at.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 */
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly listActive: ListActivePromotionsUseCase) {}

  /**
   * GET /api/promotions
   *
   * Returns active promotions where ends_at IS NULL OR ends_at > now().
   * Ordered by plan_key ASC.
   */
  @Get()
  async listActivePromotions(): Promise<SuccessResponse<unknown[]>> {
    const promos = await this.listActive.execute();
    return { success: true, data: promos.map(toPublicPromotionResponse) };
  }
}
