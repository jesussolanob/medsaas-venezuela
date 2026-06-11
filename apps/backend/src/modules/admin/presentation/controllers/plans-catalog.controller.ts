import { Controller, Get, Query } from '@nestjs/common';
import { GetPublicPlanCatalogUseCase } from '../../application/use-cases/admin/get-public-plan-catalog.use-case';
import type { PublicPlanCatalogItem } from '../../application/use-cases/admin/get-public-plan-catalog.use-case';

interface CatalogResponse {
  success: true;
  data: PublicPlanCatalogItem[];
}

/**
 * Public plans catalog controller — no authentication required.
 *
 * Exposes read-only plan information for unauthenticated visitors and
 * authenticated doctors alike (e.g., /doctor/upgrade, /register pages).
 *
 * Intentionally NOT decorated with @UseGuards or @Roles. It must never
 * be placed behind DevAuthGuard or RolesGuard.
 *
 * Route: GET /api/plans
 */
@Controller('plans')
export class PlansCatalogController {
  constructor(private readonly getCatalog: GetPublicPlanCatalogUseCase) {}

  /**
   * GET /api/plans?role=doctor
   *
   * Returns active plans for the given role, ordered by sort_order.
   * - `role` defaults to 'doctor' when omitted or invalid.
   * - Only active plans (is_active=true) are included.
   * - Only active price entries are included.
   * - No PII, no internal flags exposed.
   */
  @Get()
  async listCatalog(@Query('role') role?: string): Promise<CatalogResponse> {
    const data = await this.getCatalog.execute({ role });
    return { success: true, data };
  }
}
