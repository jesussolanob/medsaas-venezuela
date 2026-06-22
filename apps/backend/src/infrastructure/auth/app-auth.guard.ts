import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DevAuthGuard } from './dev-auth.guard';
import { Auth0Guard } from './auth0.guard';
import { ACCOUNT_STATUS_PORT, type IAccountStatusPort } from './account-status.port';
import { AccountBlockedError } from './errors/account-blocked.error';

/**
 * AppAuthGuard — mode-aware authentication guard.
 *
 * Dispatches to the correct underlying guard based on the AUTH_MODE env var:
 *
 *   AUTH_MODE=dev    (default / absent) → DevAuthGuard
 *     Reads x-dev-user-id / x-dev-user-role headers. Local development only.
 *     DevAuthGuard refuses to run when NODE_ENV=production.
 *
 *   AUTH_MODE=auth0  → Auth0Guard
 *     Validates x-auth0-token, resolves profile from DB, and sets request.user.
 *     Requires AUTH0_DOMAIN and AUTH0_CLIENT_ID to be set.
 *
 * After the underlying guard runs and sets request.user, this guard also
 * enforces the hard account ban (profiles.is_active = false):
 *
 *   - If request.user.role === 'super_admin' → skip block check (anti-lockout).
 *   - Otherwise: read is_active from DB via IAccountStatusPort.
 *     If false → throw AccountBlockedError (HTTP 403, code ACCOUNT_BLOCKED).
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
    @Inject(ACCOUNT_STATUS_PORT)
    private readonly accountStatus: IAccountStatusPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.config.get<string>('AUTH_MODE') ?? 'dev';

    let result: boolean | Promise<boolean>;
    if (mode === 'auth0') {
      result = this.auth0Guard.canActivate(context);
    } else {
      result = this.devAuthGuard.canActivate(context);
    }

    const allowed = await result;
    if (!allowed) return false;

    // After the underlying guard sets request.user, enforce the hard account ban.
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { sub: string; role: string } }>();
    const user = request.user;

    // super_admin is always allowed — prevents admin lockout.
    if (!user || user.role === 'super_admin') return true;

    const active = await this.accountStatus.isActive(user.sub);
    if (!active) throw new AccountBlockedError();

    return true;
  }
}
