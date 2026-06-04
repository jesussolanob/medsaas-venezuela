import { SetMetadata } from '@nestjs/common';
import type { CapabilityAction } from '../../domain/entities/role-capability.entity';

export const CAPABILITY_KEY = 'required_capability';

export interface RequiredCapability {
  moduleKey: string;
  action: CapabilityAction;
}

/**
 * Marks a route handler as requiring a specific module capability.
 *
 * Enforced by CapabilitiesGuard, which resolves the authenticated user's role
 * capabilities from DB/Redis and denies (403) if the action is not allowed.
 *
 * @example
 *   @RequireCapability('finances', 'view')
 *   @Get('summary')
 *   getSummary() { ... }
 */
export const RequireCapability = (moduleKey: string, action: CapabilityAction) =>
  SetMetadata(CAPABILITY_KEY, { moduleKey, action } satisfies RequiredCapability);
