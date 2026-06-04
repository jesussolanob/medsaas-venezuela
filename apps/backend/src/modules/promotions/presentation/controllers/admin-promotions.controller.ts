import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';

import {
  CreatePromotionDtoSchema,
  UpdatePromotionDtoSchema,
  type CreatePromotionDto,
  type UpdatePromotionDto,
} from '../../application/dtos/promotion.dto';
import { ListAllPromotionsUseCase } from '../../application/use-cases/promotions/list-all-promotions.use-case';
import { CreatePromotionUseCase } from '../../application/use-cases/promotions/create-promotion.use-case';
import { UpdatePromotionUseCase } from '../../application/use-cases/promotions/update-promotion.use-case';
import { DeletePromotionUseCase } from '../../application/use-cases/promotions/delete-promotion.use-case';
import { toAdminPromotionResponse } from '../mappers/promotion.mapper';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Admin promotions controller.
 *
 * All endpoints require DevAuthGuard (authentication) and RolesGuard with
 * @Roles('super_admin') (authorization). Applied at class level — no gaps.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 */
@Controller('admin/promotions')
@UseGuards(DevAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminPromotionsController {
  constructor(
    private readonly listAll: ListAllPromotionsUseCase,
    private readonly createPromotion: CreatePromotionUseCase,
    private readonly updatePromotion: UpdatePromotionUseCase,
    private readonly deletePromotion: DeletePromotionUseCase,
  ) {}

  /**
   * GET /api/admin/promotions
   *
   * Returns all promotions (active and inactive), ordered by created_at DESC.
   */
  @Get()
  async list(): Promise<SuccessResponse<unknown[]>> {
    const promos = await this.listAll.execute();
    return { success: true, data: promos.map(toAdminPromotionResponse) };
  }

  /**
   * POST /api/admin/promotions
   *
   * Creates a new promotion. Validates promo < original (domain invariant).
   * label defaults to "Oferta N meses" when not provided.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(CreatePromotionDtoSchema)) dto: CreatePromotionDto,
  ): Promise<SuccessResponse<unknown>> {
    const promo = await this.createPromotion.execute({
      planKey: dto.plan_key,
      durationMonths: dto.duration_months,
      originalPriceUsd: dto.original_price_usd,
      promoPriceUsd: dto.promo_price_usd,
      label: dto.label ?? null,
      isActive: dto.is_active,
      endsAt: dto.ends_at ?? null,
    });
    return { success: true, data: toAdminPromotionResponse(promo) };
  }

  /**
   * PUT /api/admin/promotions/:id
   *
   * Partially updates a promotion. All body fields are optional.
   * Domain validates price invariants after merging existing + incoming values.
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdatePromotionDtoSchema)) dto: UpdatePromotionDto,
  ): Promise<SuccessResponse<unknown>> {
    const promo = await this.updatePromotion.execute({
      promotionId: id,
      planKey: dto.plan_key,
      durationMonths: dto.duration_months,
      originalPriceUsd: dto.original_price_usd,
      promoPriceUsd: dto.promo_price_usd,
      label: dto.label,
      isActive: dto.is_active,
      endsAt: dto.ends_at,
    });
    return { success: true, data: toAdminPromotionResponse(promo) };
  }

  /**
   * DELETE /api/admin/promotions/:id
   *
   * Deletes a promotion. Returns 204 No Content on success.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.deletePromotion.execute({ promotionId: id });
  }
}
