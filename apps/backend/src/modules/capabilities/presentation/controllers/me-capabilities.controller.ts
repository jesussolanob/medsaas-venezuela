import { Controller, Get, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ResolveCapabilitiesUseCase } from '../../application/use-cases/capabilities/resolve-capabilities.use-case';
import type { ModuleCapabilityMap } from '../../domain/entities/role-capability.entity';

interface CapabilitiesResponse {
  success: true;
  data: {
    role: string;
    modules: ModuleCapabilityMap;
  };
}

/**
 * GET /api/me/capabilities
 *
 * Returns the capability map for the authenticated user's role. The frontend
 * uses this to show/hide modules and actions without baking permissions into
 * the token.
 *
 * Auth: DevAuthGuard (reads x-dev-user-id + x-dev-user-role headers).
 * Auth0-ready: the role comes from @CurrentUser().role — agnostic of auth source.
 */
@Controller('me')
@UseGuards(DevAuthGuard)
export class MeCapabilitiesController {
  constructor(private readonly resolveCapabilities: ResolveCapabilitiesUseCase) {}

  @Get('capabilities')
  async getMyCapabilities(@CurrentUser() user: CurrentUserPayload): Promise<CapabilitiesResponse> {
    const result = await this.resolveCapabilities.execute(user.role);
    return {
      success: true,
      data: {
        role: result.role,
        modules: result.modules,
      },
    };
  }
}
