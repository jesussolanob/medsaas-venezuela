import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import { UpdateUsdtRateDtoSchema, type UpdateUsdtRateDto } from '@delta/shared-types';
import { GetUsdtRateUseCase } from '../../application/use-cases/finances/get-usdt-rate.use-case';
import { UpdateUsdtRateUseCase } from '../../application/use-cases/finances/update-usdt-rate.use-case';
import type { GetUsdtRateOutput } from '../../application/use-cases/finances/get-usdt-rate.use-case';
import type { UpdateUsdtRateOutput } from '../../application/use-cases/finances/update-usdt-rate.use-case';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Public settings endpoint — no authentication required.
 * GET /api/settings/usdt-rate
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly getRate: GetUsdtRateUseCase) {}

  /** GET /api/settings/usdt-rate — returns the current USDT/BS rate. Public endpoint. */
  @Get('usdt-rate')
  async getUsdtRate(): Promise<SuccessResponse<GetUsdtRateOutput>> {
    const result = await this.getRate.execute();
    return { success: true, data: result };
  }
}

/**
 * Admin settings controller — requires super_admin role.
 * POST /api/admin/settings/usdt-rate
 *
 * Authorization: DevAuthGuard authenticates the request; RolesGuard enforces
 * the super_admin restriction. The use case itself only validates the rate value.
 */
@Controller('admin/settings')
@UseGuards(DevAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminSettingsController {
  constructor(private readonly updateRate: UpdateUsdtRateUseCase) {}

  /** POST /api/admin/settings/usdt-rate — updates USDT/BS rate. Requires super_admin. */
  @Post('usdt-rate')
  async updateUsdtRate(
    @Body(new ZodValidationPipe(UpdateUsdtRateDtoSchema)) dto: UpdateUsdtRateDto,
  ): Promise<SuccessResponse<UpdateUsdtRateOutput>> {
    const result = await this.updateRate.execute({ rate: dto.rate });
    return { success: true, data: result };
  }
}
