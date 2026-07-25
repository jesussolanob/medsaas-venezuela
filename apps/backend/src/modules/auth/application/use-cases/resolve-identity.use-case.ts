import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/nestjs';
import type { ResolveIdentityDto, ResolveIdentityOutputDto } from '../dtos/resolve-identity.dto';
import {
  IDENTITY_REPOSITORY,
  type IIdentityRepository,
} from '../../domain/repositories/identity.repository';
import {
  ResolveSecretNotConfiguredError,
  ResolveSecretInvalidError,
} from '../../domain/errors/identity-resolve.error';

/**
 * Roles that must NEVER be assigned via self-service identity resolution.
 * Elevation to super_admin is a manual DBA/admin action.
 */
const FORBIDDEN_ROLES = new Set(['super_admin', 'admin']);

/**
 * Default role assigned when the requested role is absent or forbidden.
 */
const DEFAULT_ROLE = 'doctor';

/**
 * ResolveIdentityUseCase
 *
 * Given an Auth0 email + optional metadata:
 *   - Finds the matching profile (case-insensitive email).
 *   - Returns it as-is when found (never overwrites existing role).
 *   - Creates a new profile when not found; silently demotes super_admin/admin
 *     requests to 'doctor' (promotion is a manual admin action).
 *
 * ⚠️  resolve-identity is called ONCE PER REQUEST by the BFF for every
 * authenticated user, not only at registration time.  All logging is therefore
 * scoped to the new-doctor path (when findByEmail returns null) so existing
 * users never generate noise.
 *
 * Security:
 *   - Validates the x-internal-auth-secret header before any DB access.
 *   - Fails closed (503) when AUTH_RESOLVE_SECRET is not configured.
 *   - NEVER logs tokens, secrets, or patient PII.
 *   - Doctor email and full_name ARE logged on the new-doctor path
 *     (business contact data, not patient PII) so Cloud Logging and Sentry
 *     can recover lost contacts when the registration fails.
 *
 * Failure recovery — new-doctor path only (multiple independent fallbacks):
 *   1. Cloud Logging — [signup] structured lines (attempt / created / failed).
 *   2. Sentry — error event on registration failure (SENTRY_ENABLED=true only).
 *   3. Auth0 — external, no code needed.
 */
@Injectable()
export class ResolveIdentityUseCase {
  private readonly logger = new Logger(ResolveIdentityUseCase.name);

  constructor(
    @Inject(IDENTITY_REPOSITORY)
    private readonly identityRepo: IIdentityRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(
    dto: ResolveIdentityDto,
    callerSecret: string | undefined,
  ): Promise<ResolveIdentityOutputDto> {
    // 1. Fail-closed: secret must be configured on the server side.
    const configuredSecret = this.config.get<string>('AUTH_RESOLVE_SECRET');
    if (!configuredSecret || configuredSecret.trim().length === 0) {
      throw new ResolveSecretNotConfiguredError();
    }

    // 2. Validate caller secret — constant-time comparison avoids timing attacks.
    if (!callerSecret || !timingSafeEqual(callerSecret, configuredSecret)) {
      throw new ResolveSecretInvalidError();
    }

    // 3. Normalise email before any lookup or persistence.
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 4. Look up existing profile.
    //    Returning here for known users keeps all logging off the per-request
    //    hot path — existing users never reach step 5.
    const existing = await this.identityRepo.findByEmail(normalizedEmail);
    if (existing) {
      // Optionally update auth0Sub if it arrives for the first time.
      if (dto.sub && !existing.auth0Sub) {
        await this.identityRepo.updateAuth0Sub(existing.id, dto.sub);
      }
      return {
        id: existing.id,
        email: existing.email,
        fullName: existing.fullName,
        role: existing.role,
        created: false,
      };
    }

    // -------------------------------------------------------------------------
    // New-doctor path — everything below runs ONCE per doctor, not per request.
    // -------------------------------------------------------------------------

    const displayName = dto.fullName ?? normalizedEmail;

    // 5. Log the incoming registration attempt so Cloud Logging captures the
    //    contact even if the DB write below fails.
    this.logger.log(`[signup] attempt email="${normalizedEmail}" name="${displayName}"`);

    // 6. Determine safe role for new profile.
    const requestedRole = dto.role ?? DEFAULT_ROLE;
    const safeRole = FORBIDDEN_ROLES.has(requestedRole) ? DEFAULT_ROLE : requestedRole;

    // 7. Create new profile; on failure activate remaining fallback channels.
    const profileId = randomUUID();
    let created;
    try {
      created = await this.identityRepo.create({
        id: profileId,
        email: normalizedEmail,
        fullName: dto.fullName ?? normalizedEmail,
        role: safeRole,
        auth0Sub: dto.sub ?? null,
      });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);

      // Fallback 1: structured error log with email so Cloud Logging captures it.
      this.logger.error(
        `[signup] failed email="${normalizedEmail}" name="${displayName}" reason="${reason}"`,
      );

      // Fallback 2: Sentry — best-effort, never throws.
      reportSignupFailureToSentry(normalizedEmail, displayName, err);

      throw err;
    }

    // Log successful registration so the contact is visible on the happy path.
    this.logger.log(
      `[signup] created profileId="${created.id}" email="${normalizedEmail}" name="${displayName}"`,
    );

    return {
      id: created.id,
      email: created.email,
      fullName: created.fullName,
      role: created.role,
      created: true,
    };
  }
}

/**
 * Reports a registration failure to Sentry when SENTRY_ENABLED=true.
 *
 * Uses withScope so the user/tag context is scoped to this single event and
 * does not bleed into other concurrent requests.
 *
 * Never throws — all errors are swallowed so this can never affect the login flow.
 */
function reportSignupFailureToSentry(email: string, name: string, err: unknown): void {
  if (process.env.SENTRY_ENABLED !== 'true') return;
  try {
    Sentry.withScope((scope) => {
      // Make the contact searchable in the Sentry "Users" tab.
      scope.setUser({ email });
      // Stable tag for alerts / saved searches.
      scope.setTag('signup_failure', 'true');
      // Human-readable extras visible in the event detail panel.
      scope.setExtra('signup_email', email);
      scope.setExtra('signup_name', name);
      scope.captureException(err);
    });
  } catch {
    // Sentry itself errored — ignore silently.
  }
}

/**
 * Constant-time string comparison to prevent timing-based secret enumeration.
 * Falls back to a length-equalising dummy comparison if lengths differ.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');

  // Ensure same-length buffers to prevent short-circuit timing leaks.
  if (bufA.length !== bufB.length) {
    // Do a dummy comparison to consume constant time, then return false.
    const dummy = Buffer.alloc(bufA.length, 0);
    let acc = 0;
    for (let i = 0; i < dummy.length; i++) {
      acc |= dummy[i]! ^ (bufA[i] ?? 0);
    }
    // acc is unused — suppress linting with void.
    void acc;
    return false;
  }

  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i]! ^ bufB[i]!;
  }
  return diff === 0;
}
