import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { GetRetentionMetricsUseCase } from '../../application/use-cases/get-retention-metrics.use-case';
import { RetentionMetricsQuerySchema } from '@delta/shared-types';

/**
 * AdminRetentionController — super_admin retention metrics endpoint.
 *
 * Global prefix 'api' is set in main.ts.
 *
 * ROUTES:
 *   GET /api/admin/retention/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
@Controller('admin/retention')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminRetentionController {
  constructor(private readonly getMetrics: GetRetentionMetricsUseCase) {}

  /**
   * GET /api/admin/retention/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
   *
   * Returns aggregate retention metrics for the given date range.
   * Dates are inclusive and interpreted as Caracas-day boundaries.
   */
  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  async metrics(@Query() query: unknown) {
    const { from, to } = RetentionMetricsQuerySchema.parse(query);
    const data = await this.getMetrics.execute({ from, to });
    return { success: true, data };
  }
}
