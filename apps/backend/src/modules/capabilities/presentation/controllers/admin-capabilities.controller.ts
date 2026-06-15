import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';

import {
  SetCapabilityDtoSchema,
  type SetCapabilityDto,
} from '../../application/dtos/capability.dto';
import { ListAllCapabilitiesUseCase } from '../../application/use-cases/capabilities/list-all-capabilities.use-case';
import { SetCapabilityUseCase } from '../../application/use-cases/capabilities/set-capability.use-case';
import { RefreshCapabilitiesCacheUseCase } from '../../application/use-cases/capabilities/refresh-capabilities-cache.use-case';
import type { RoleCapability } from '../../domain/entities/role-capability.entity';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface CapabilityRow {
  id: string;
  role: string;
  module_key: string;
  action: string;
  allowed: boolean;
}

function toCapabilityRow(entity: RoleCapability): CapabilityRow {
  return {
    id: entity.id,
    role: entity.role,
    module_key: entity.moduleKey,
    action: entity.action,
    allowed: entity.allowed,
  };
}

/**
 * Admin controller for managing role capabilities.
 *
 * All endpoints require AppAuthGuard + RolesGuard with @Roles('super_admin').
 *
 * GET  /api/admin/role-capabilities → all rows grouped by role
 * PUT  /api/admin/role-capabilities → upsert a single capability + invalidate cache
 */
@Controller('admin/role-capabilities')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('super_admin')
export class AdminCapabilitiesController {
  constructor(
    private readonly listAll: ListAllCapabilitiesUseCase,
    private readonly setCapability: SetCapabilityUseCase,
    private readonly refreshCache: RefreshCapabilitiesCacheUseCase,
  ) {}

  /**
   * GET /api/admin/role-capabilities
   *
   * Returns all role_capabilities rows grouped by role.
   * Each role maps to an array of { id, role, module_key, action, allowed }.
   */
  @Get()
  async list(): Promise<SuccessResponse<Record<string, CapabilityRow[]>>> {
    const grouped = await this.listAll.execute();
    const result: Record<string, CapabilityRow[]> = {};
    for (const [role, rows] of Object.entries(grouped)) {
      result[role] = rows.map(toCapabilityRow);
    }
    return { success: true, data: result };
  }

  /**
   * PUT /api/admin/role-capabilities
   *
   * Upserts a single capability row and invalidates the role's Redis cache.
   * Body: { role, module_key, action, allowed }
   */
  @Put()
  async set(
    @Body(new ZodValidationPipe(SetCapabilityDtoSchema)) dto: SetCapabilityDto,
  ): Promise<SuccessResponse<CapabilityRow>> {
    const saved = await this.setCapability.execute({
      role: dto.role,
      moduleKey: dto.module_key,
      action: dto.action,
      allowed: dto.allowed,
    });
    return { success: true, data: toCapabilityRow(saved) };
  }

  /**
   * POST /api/admin/role-capabilities/refresh
   *
   * Flushes ALL cached role capabilities from Redis (SCAN + DEL `capabilities:*`).
   * Escape hatch for out-of-band DB changes that bypass the PUT endpoint and thus
   * never trigger per-role invalidation. Returns the number of keys deleted.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(): Promise<SuccessResponse<{ keysDeleted: number }>> {
    const result = await this.refreshCache.execute();
    return { success: true, data: result };
  }
}
