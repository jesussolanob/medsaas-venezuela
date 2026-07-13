import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  UpdateUsdtRateDtoSchema,
  type UpdateUsdtRateDto,
  SetRateSourceDtoSchema,
  type SetRateSourceDto,
} from '@delta/shared-types';
import { GetUsdtRateUseCase } from '../../application/use-cases/finances/get-usdt-rate.use-case';
import {
  GetBcvRateByDateUseCase,
  type GetBcvRateByDateOutput,
} from '../../application/use-cases/finances/get-bcv-rate-by-date.use-case';
import { UpdateUsdtRateUseCase } from '../../application/use-cases/finances/update-usdt-rate.use-case';
import { SetRateSourceUseCase } from '../../application/use-cases/finances/set-rate-source.use-case';
import { GetRatesSummaryUseCase } from '../../application/use-cases/finances/get-rates-summary.use-case';
import type { GetUsdtRateOutput } from '../../application/use-cases/finances/get-usdt-rate.use-case';
import type { UpdateUsdtRateOutput } from '../../application/use-cases/finances/update-usdt-rate.use-case';
import type { SetRateSourceOutput } from '../../application/use-cases/finances/set-rate-source.use-case';
import type { RatesSummary } from '../../domain/repositories/usdt-rate.store';

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
  constructor(
    private readonly getRate: GetUsdtRateUseCase,
    private readonly getBcvRateByDate: GetBcvRateByDateUseCase,
  ) {}

  /**
   * GET /api/settings/usdt-rate — returns the current USDT/BS rate. Public endpoint.
   *
   * Response is additive: the `source` field indicates the active rate source.
   * Existing callers reading only `rate` are unaffected.
   */
  @Get('usdt-rate')
  async getUsdtRate(): Promise<SuccessResponse<GetUsdtRateOutput>> {
    const result = await this.getRate.execute();
    return { success: true, data: result };
  }

  /**
   * GET /api/settings/bcv-rate?date=YYYY-MM-DD
   * Returns the BCV USD/VES rate for a specific calendar date.
   * Requires authentication (doctor level) — writes to bcv_rate_history cache.
   *
   * Resolution: local cache → pydolarve history API → current BCV rate fallback.
   * On total failure: { rate: null, source: 'unavailable' } — never returns 500.
   *
   * Response: { rate: number | null, date: string, source: 'cache'|'pydolarve'|'current-fallback'|'unavailable' }
   */
  @Get('bcv-rate')
  @UseGuards(AppAuthGuard)
  async getBcvRate(@Query('date') date?: string): Promise<SuccessResponse<GetBcvRateByDateOutput>> {
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }

    // Default to today when no date is given.
    const effectiveDate = date ?? new Date().toISOString().slice(0, 10);

    const result = await this.getBcvRateByDate.execute({ date: effectiveDate });
    return { success: true, data: result };
  }
}

/**
 * Admin settings controller — requires super_admin role.
 *
 * POST /api/admin/settings/usdt-rate   — set manual rate (backward-compatible)
 * POST /api/admin/settings/rate-source — choose active source
 * GET  /api/admin/settings/rates       — summary of all known rates
 */
@Controller('admin/settings')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminSettingsController {
  constructor(
    private readonly updateRate: UpdateUsdtRateUseCase,
    private readonly setSource: SetRateSourceUseCase,
    private readonly getRatesSummary: GetRatesSummaryUseCase,
  ) {}

  /**
   * POST /api/admin/settings/usdt-rate — updates USDT/BS rate manually.
   * Also sets rate_source='manual'. Backward-compatible with existing callers.
   */
  @Post('usdt-rate')
  async updateUsdtRate(
    @Body(new ZodValidationPipe(UpdateUsdtRateDtoSchema)) dto: UpdateUsdtRateDto,
  ): Promise<SuccessResponse<UpdateUsdtRateOutput>> {
    const result = await this.updateRate.execute({ rate: dto.rate });
    return { success: true, data: result };
  }

  /**
   * POST /api/admin/settings/rate-source — sets the active rate source.
   * When switching to 'binance' or 'bcv', immediately triggers a fetch.
   * When switching to 'manual', `value` is required.
   */
  @Post('rate-source')
  async setRateSource(
    @Body(new ZodValidationPipe(SetRateSourceDtoSchema)) dto: SetRateSourceDto,
  ): Promise<SuccessResponse<SetRateSourceOutput>> {
    const result = await this.setSource.execute({
      source: dto.source,
      value: dto.value,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/admin/settings/rates — returns all rate values for the admin panel.
   * { source, manual, binance, bcv, effective }
   */
  @Get('rates')
  async getRates(): Promise<SuccessResponse<RatesSummary>> {
    const result = await this.getRatesSummary.execute();
    return { success: true, data: result };
  }
}
