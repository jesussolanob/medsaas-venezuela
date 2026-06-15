import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DevAuthGuard } from './dev-auth.guard';
import { Auth0Guard } from './auth0.guard';

/**
 * AppAuthGuard — mode-aware authentication guard.
 *
 * Dispatches to the correct underlying guard based on the AUTH_MODE env var:
 *
 *   AUTH_MODE=dev    (default / absent) → DevAuthGuard
 *     Reads x-dev-user-id / x-dev-user-role headers. Local development only.
 *     DevAuthGuard still refuses to run in production unless ALLOW_DEV_AUTH=true.
 *
 *   AUTH_MODE=auth0  → Auth0Guard
 *     Validates x-auth0-token, resolves profile from DB, and sets request.user.
 *     Requires AUTH0_DOMAIN and AUTH0_CLIENT_ID to be set.
 *
 * RolesGuard and CapabilitiesGuard read from request.user (set by whichever
 * underlying guard runs) — they are unaffected by this delegation.
 *
 * Usage (replaces all previous @UseGuards(DevAuthGuard) usages):
 *
 *   @UseGuards(AppAuthGuard)
 *   // or, with RBAC:
 *   @UseGuards(AppAuthGuard, RolesGuard)
 */
@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly devAuthGuard: DevAuthGuard,
    private readonly auth0Guard: Auth0Guard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.config.get<string>('AUTH_MODE') ?? 'dev';

    if (mode === 'auth0') {
      return this.auth0Guard.canActivate(context);
    }

    // Default: dev mode
    return this.devAuthGuard.canActivate(context);
  }
}
