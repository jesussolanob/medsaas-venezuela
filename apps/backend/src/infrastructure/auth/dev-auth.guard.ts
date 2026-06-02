import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUserPayload } from '../../presentation/decorators/current-user.decorator';

/**
 * Development-only authentication guard — NEVER use in production.
 *
 * Reads the acting user from `x-dev-user-id` / `x-dev-user-role` headers so
 * endpoints can be exercised without Auth0. In production this is replaced by a
 * real JWT strategy (see migracion/03-seguridad.md).
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DevAuthGuard must not be used in production');
    }

    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();

    const userId = request.headers['x-dev-user-id'];
    const role = (request.headers['x-dev-user-role'] as CurrentUserPayload['role']) ?? 'doctor';

    if (typeof userId !== 'string' || userId.length === 0) {
      return false;
    }

    request.user = { sub: userId, role, email: `${userId}@dev.local` };
    return true;
  }
}
