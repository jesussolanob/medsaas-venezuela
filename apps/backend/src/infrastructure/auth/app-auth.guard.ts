import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { DevAuthGuard } from './dev-auth.guard';
import { Auth0Guard } from './auth0.guard';
import { ACCOUNT_STATUS_PORT, type IAccountStatusPort } from './account-status.port';
import { AccountBlockedError } from './errors/account-blocked.error';
import { ReviewerTokenService } from './reviewer-token.service';

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
 * Reviewer path (checked BEFORE normal dispatch):
 *   When REVIEWER_ACCESS_ENABLED === 'true' AND the request carries the header
 *   x-reviewer-token, this guard verifies the HMAC session token via
 *   ReviewerTokenService. If valid, request.user is set to the demo doctor profile
 *   (role: 'doctor', sub: REVIEWER_PROFILE_ID) and normal dispatch is skipped.
 *   If the header is present but the token is invalid or expired, the guard rejects
 *   with 401 — it does NOT fall through to the dev/auth0 path (avoids ambiguity).
 *   When the flag is off, any x-reviewer-token header is silently ignored and the
 *   normal dispatch path runs unchanged.
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
 *
 * Environment variables for the reviewer path:
 *   REVIEWER_ACCESS_ENABLED — kill-switch, must be 'true' to enable (default off).
 *   REVIEWER_PROFILE_ID     — UUID of the demo doctor profile; never super_admin.
 *   REVIEWER_SESSION_SECRET — HMAC secret, consumed by ReviewerTokenService.
 */
@Injectable()
export class AppAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly devAuthGuard: DevAuthGuard,
    private readonly auth0Guard: Auth0Guard,
    @Inject(ACCOUNT_STATUS_PORT)
    private readonly accountStatus: IAccountStatusPort,
    private readonly reviewerTokenService: ReviewerTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { sub: string; role: string } }>();

    // -------------------------------------------------------------------------
    // Reviewer path — checked FIRST, before normal dev/auth0 dispatch.
    // -------------------------------------------------------------------------
    const reviewerEnabled = this.config.get<string>('REVIEWER_ACCESS_ENABLED') === 'true';
    const reviewerHeader = request.headers['x-reviewer-token'];

    // A real Auth0 token ALWAYS wins over a reviewer token. Without this, a caller
    // holding both (e.g. a leftover 12h reviewer cookie plus a genuine session)
    // would be resolved as the demo doctor instead of themselves. The frontend
    // already refrains from sending both, but the guard must not depend on the
    // caller behaving correctly.
    const hasAuth0Token = typeof request.headers['x-auth0-token'] === 'string';

    if (typeof reviewerHeader === 'string' && reviewerHeader.length > 0 && !hasAuth0Token) {
      if (!reviewerEnabled) {
        // Flag is off — ignore the header entirely and fall through to normal dispatch.
        // This means reviewer tokens are silently rejected when the feature is disabled
        // (treated as if the header was never sent).
      } else {
        // Flag is on and the header is present — verify the token.
        const payload = this.reviewerTokenService.verify(reviewerHeader);
        if (!payload) {
          // Invalid or expired reviewer token — reject immediately, do NOT fall
          // through to dev/auth0 (prevents credential-mixing attacks).
          throw new UnauthorizedException('Reviewer token inválido o expirado');
        }

        // Valid token — set request.user to the demo doctor profile and proceed
        // directly to the ban check. The reviewer is ALWAYS scoped to doctor role.
        request.user = { sub: payload.sub, role: 'doctor' };
        return this.checkAccountBan(request.user);
      }
    }

    // -------------------------------------------------------------------------
    // Normal dispatch path — identical to the pre-reviewer behaviour.
    // -------------------------------------------------------------------------
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
    const user = request.user;

    // super_admin is always allowed — prevents admin lockout.
    if (!user || user.role === 'super_admin') return true;

    return this.checkAccountBan(user);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async checkAccountBan(user: { sub: string; role: string }): Promise<boolean> {
    if (user.role === 'super_admin') return true;

    const active = await this.accountStatus.isActive(user.sub);
    if (!active) throw new AccountBlockedError();

    return true;
  }
}
