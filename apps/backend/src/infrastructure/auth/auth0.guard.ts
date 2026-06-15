import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Request } from 'express';
import type { CurrentUserPayload } from '../../presentation/decorators/current-user.decorator';
import { IdentityResolverService } from './identity-resolver.service';
import {
  Auth0TokenMissingError,
  Auth0TokenInvalidError,
  Auth0EmailMissingError,
  Auth0ConfigMissingError,
} from './errors/auth0.errors';

/**
 * Header used to pass the Auth0 ID token to the backend.
 *
 * We deliberately use a custom header (`x-auth0-token`) instead of
 * `Authorization` because Cloud Run IAM occupies the `Authorization` header
 * for service-to-service authentication and stripping/forwarding it is error-prone.
 */
export const AUTH0_TOKEN_HEADER = 'x-auth0-token';

/**
 * Default namespace for custom Auth0 claims.
 * Overridable via AUTH0_ROLE_NAMESPACE env var.
 */
const DEFAULT_ROLE_NAMESPACE = 'https://deltamedical.app';

/**
 * JWKS remote key set — instantiated once per guard instance (singleton in DI).
 * jose caches the fetched keys internally and re-fetches when a new kid appears.
 */
type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>;

/**
 * Auth0Guard
 *
 * Validates an Auth0 ID token from the `x-auth0-token` request header and
 * resolves the corresponding profile from the database.
 *
 * Flow:
 *   1. Extract JWT from header (accepts `Bearer <jwt>` or raw JWT).
 *   2. Verify with createRemoteJWKSet (JWKS at /.well-known/jwks.json).
 *   3. Validate issuer and audience (AUTH0_DOMAIN / AUTH0_CLIENT_ID).
 *   4. Extract `email` and optional role namespace claim from payload.
 *   5. Resolve or create the profile via IdentityResolverService.
 *   6. Set request.user = { sub: profileUUID, role, email }.
 *
 * The JWKS set is created once on first use (lazy init) and reused across
 * requests — jose handles cache invalidation internally.
 *
 * On config error (missing AUTH0_DOMAIN / AUTH0_CLIENT_ID) the guard throws
 * Auth0ConfigMissingError (503) so the caller gets a clear message instead of
 * an opaque 500.
 */
@Injectable()
export class Auth0Guard implements CanActivate {
  private readonly logger = new Logger(Auth0Guard.name);
  private jwks: RemoteJWKSet | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly identityResolver: IdentityResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();

    const token = this.extractToken(request);

    const payload = await this.verifyToken(token);

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
    if (!email) {
      throw new Auth0EmailMissingError();
    }

    const namespace = this.config.get<string>('AUTH0_ROLE_NAMESPACE') ?? DEFAULT_ROLE_NAMESPACE;
    const roleHint = payload[`${namespace}/role`] as string | undefined;
    const auth0Sub = typeof payload.sub === 'string' ? payload.sub : undefined;
    const name =
      typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined;

    const resolved = await this.identityResolver.resolve({
      email,
      auth0Sub,
      roleHint,
      name,
    });

    request.user = {
      sub: resolved.profileId,
      role: resolved.role,
      email: resolved.email,
    };

    return true;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private extractToken(request: Request): string {
    const raw = request.headers[AUTH0_TOKEN_HEADER];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Auth0TokenMissingError();
    }

    // Accept both "Bearer <jwt>" and a raw JWT string.
    // Normalise the entire value and then strip the optional scheme prefix.
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('bearer')) {
      // Strip the 'Bearer' / 'bearer' prefix (6 chars) then any trailing spaces.
      const jwt = trimmed.slice(6).trim();
      if (!jwt) throw new Auth0TokenMissingError();
      return jwt;
    }

    return trimmed;
  }

  private async verifyToken(token: string): Promise<JWTPayload> {
    const domain = this.config.get<string>('AUTH0_DOMAIN');
    const clientId = this.config.get<string>('AUTH0_CLIENT_ID');

    if (!domain) throw new Auth0ConfigMissingError('AUTH0_DOMAIN');
    if (!clientId) throw new Auth0ConfigMissingError('AUTH0_CLIENT_ID');

    // Lazy-initialise the JWKS set once per guard instance.
    if (!this.jwks) {
      this.jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    }

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: `https://${domain}/`,
        audience: clientId,
        algorithms: ['RS256'],
      });
      return payload;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Auth0 token verification failed: ${reason}`);
      // Throw a generic error — do NOT propagate `reason` to the client (information disclosure).
      throw new Auth0TokenInvalidError();
    }
  }
}
