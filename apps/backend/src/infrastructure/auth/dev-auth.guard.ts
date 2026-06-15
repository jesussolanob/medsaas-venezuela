import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUserPayload } from '../../presentation/decorators/current-user.decorator';

/**
 * Header-based authentication guard for local development.
 *
 * Reads the acting user from `x-dev-user-id` / `x-dev-user-role` headers.
 * The frontend BFF sets these headers after resolving the dev identity.
 *
 * Refuses to run when NODE_ENV=production — the production path uses Auth0Guard
 * via AppAuthGuard (AUTH_MODE=auth0). If you need to test this guard in a
 * non-local environment, start the process with NODE_ENV=development.
 *
 * Never used directly in production controllers — always go through AppAuthGuard.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DevAuthGuard must not be used in production. Set AUTH_MODE=auth0 and use AppAuthGuard.',
      );
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
