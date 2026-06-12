import { Controller, Get } from '@nestjs/common';
import { GetPublicStatsUseCase } from '../../application/use-cases/admin/get-public-stats.use-case';
import type { PublicStats } from '../../domain/repositories/admin.repository';

interface PublicStatsResponse {
  success: true;
  data: PublicStats;
}

/**
 * Public stats controller — no authentication required.
 *
 * Exposes aggregate counters for the landing page hero section.
 * Intentionally NOT decorated with @UseGuards or @Roles.
 *
 * SECURITY CONTRACT:
 *   - Only integer counts are returned — no PII.
 *   - No patient names, cédulas, or emails are ever exposed here.
 *
 * Route: GET /api/public/stats
 */
@Controller('public')
export class PublicStatsController {
  constructor(private readonly getPublicStats: GetPublicStatsUseCase) {}

  /**
   * GET /api/public/stats
   *
   * Returns:
   *   - specialists: count of verified doctors (or all doctors if none verified)
   *   - patients: total patient count
   *
   * No authentication required. No PII. Safe for public landing pages.
   */
  @Get('stats')
  async stats(): Promise<PublicStatsResponse> {
    const data = await this.getPublicStats.execute();
    return { success: true, data };
  }
}
