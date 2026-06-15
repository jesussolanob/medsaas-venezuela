import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IDENTITY_REPOSITORY,
  type IIdentityRepository,
} from '../../modules/auth/domain/repositories/identity.repository';
import type { CurrentUserPayload } from '../../presentation/decorators/current-user.decorator';

/**
 * Roles that must NEVER be assigned via self-service identity resolution.
 * Elevation to super_admin is a manual DBA/admin action.
 */
const FORBIDDEN_ROLES = new Set(['super_admin', 'admin']);

/**
 * Default role assigned when the requested role is absent or forbidden.
 */
const DEFAULT_ROLE = 'doctor' as const;

export interface ResolveIdentityOptions {
  /** Verified email from the ID token (already normalised to lowercase). */
  email: string;
  /** Auth0 subject claim (optional — stored on first encounter). */
  auth0Sub?: string;
  /** Role hint from the Auth0 namespace claim — the BD role always wins. */
  roleHint?: string;
  /**
   * Display name from the Auth0 `name` claim (optional).
   * Used as fullName on first-time profile creation.
   * Falls back to the literal string 'Pendiente' if absent.
   * The email is intentionally NOT used to avoid storing PII in a plain-text name field.
   */
  name?: string;
}

export interface ResolvedIdentity {
  /** UUID of the profile row (used as sub in CurrentUserPayload). */
  profileId: string;
  email: string;
  role: CurrentUserPayload['role'];
}

/**
 * IdentityResolverService
 *
 * Shared infrastructure service used by both the Auth0 guard (Etapa 2) and
 * the ResolveIdentityUseCase (BFF M2M endpoint). Encapsulates the find-or-create
 * logic so it is never duplicated.
 *
 * Rules:
 *   - find_by_email (ILIKE) → return existing role from BD (authoritative).
 *   - not found → create with safe role (demote super_admin/admin to doctor).
 *   - roleHint is a best-effort hint from the token; the BD value always wins
 *     for existing profiles.
 *   - auth0Sub is stored on first encounter (backfill) when not already set.
 *
 * This service lives in infrastructure because it depends on IIdentityRepository
 * (which has a Sequelize implementation). Domain logic is intentionally minimal
 * here — the authoritative business rules live in ResolveIdentityUseCase.
 */
@Injectable()
export class IdentityResolverService {
  constructor(
    @Inject(IDENTITY_REPOSITORY)
    private readonly identityRepo: IIdentityRepository,
  ) {}

  async resolve(opts: ResolveIdentityOptions): Promise<ResolvedIdentity> {
    const normalizedEmail = opts.email.trim().toLowerCase();

    const existing = await this.identityRepo.findByEmail(normalizedEmail);
    if (existing) {
      // Backfill auth0Sub on first encounter without overwriting.
      if (opts.auth0Sub && !existing.auth0Sub) {
        await this.identityRepo.updateAuth0Sub(existing.id, opts.auth0Sub);
      }
      return {
        profileId: existing.id,
        email: existing.email,
        role: existing.role as CurrentUserPayload['role'],
      };
    }

    // New profile: apply safe role (demote forbidden roles).
    const requestedRole = opts.roleHint ?? DEFAULT_ROLE;
    const safeRole = FORBIDDEN_ROLES.has(requestedRole) ? DEFAULT_ROLE : requestedRole;

    const created = await this.identityRepo.create({
      id: randomUUID(),
      email: normalizedEmail,
      fullName: opts.name ?? 'Pendiente',
      role: safeRole,
      auth0Sub: opts.auth0Sub ?? null,
    });

    return {
      profileId: created.id,
      email: created.email,
      role: created.role as CurrentUserPayload['role'],
    };
  }
}
