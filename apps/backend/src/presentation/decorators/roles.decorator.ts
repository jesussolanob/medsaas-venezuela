import { SetMetadata } from '@nestjs/common';
import type { CurrentUserPayload } from './current-user.decorator';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route handler to the given roles. Enforced by RolesGuard.
 *
 * @example @Roles('super_admin')
 */
export const Roles = (...roles: CurrentUserPayload['role'][]) => SetMetadata(ROLES_KEY, roles);
