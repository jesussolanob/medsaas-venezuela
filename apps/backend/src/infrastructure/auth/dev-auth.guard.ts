import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUserPayload } from '../../presentation/decorators/current-user.decorator';

/**
 * Header-based authentication guard.
 *
 * Reads the acting user from `x-dev-user-id` / `x-dev-user-role` headers, which
 * the frontend BFF sets after resolving the Auth0 identity. By default it refuses
 * to run when NODE_ENV=production (Etapa 1 → real JWT in Etapa 2, see
 * migracion/03-seguridad.md).
 *
 * Override: set ALLOW_DEV_AUTH=true to permit it in a production-mode deployment
 * ONLY when the backend is network-isolated (e.g. Cloud Run with
 * --no-allow-unauthenticated / IAM), so the headers can only be set by the
 * trusted frontend and never by an external caller.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true';
    if (process.env.NODE_ENV === 'production' && !allowDevAuth) {
      throw new Error(
        'DevAuthGuard must not be used in production (set ALLOW_DEV_AUTH=true only on an IAM-isolated backend)',
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
