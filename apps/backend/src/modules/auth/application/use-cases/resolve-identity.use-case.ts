import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
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
 * Security:
 *   - Validates the x-internal-auth-secret header before any DB access.
 *   - Fails closed (503) when AUTH_RESOLVE_SECRET is not configured.
 *   - NEVER logs the email value.
 */
@Injectable()
export class ResolveIdentityUseCase {
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

    // 5. Determine safe role for new profile.
    const requestedRole = dto.role ?? DEFAULT_ROLE;
    const safeRole = FORBIDDEN_ROLES.has(requestedRole) ? DEFAULT_ROLE : requestedRole;

    // 6. Create new profile.
    const created = await this.identityRepo.create({
      id: randomUUID(),
      email: normalizedEmail,
      fullName: dto.fullName ?? normalizedEmail,
      role: safeRole,
      auth0Sub: dto.sub ?? null,
    });

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
