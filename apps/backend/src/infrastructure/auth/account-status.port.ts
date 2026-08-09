/**
 * AccountStatusPort — narrow port for reading the account on/off state of a profile.
 *
 * Lives in infrastructure/auth/ to keep the AppAuthGuard self-contained without
 * coupling to a full domain repository from another module.
 *
 * Reads two columns, not one. `is_active` says WHETHER the account is off;
 * `deactivated_by` says WHO turned it off. The guard needs both, because a
 * specialist who deactivated their own account from Configuración must not be
 * told their account "has been blocked" — same flag, different message, and only
 * the origin distinguishes them.
 *
 * Contract:
 *   - isActive true  when the profile is live (is_active IS NULL or true).
 *   - isActive false when is_active = false (account switched off).
 *   - deactivatedBy is meaningful only when isActive is false; null otherwise.
 *   - A missing profile row resolves to active (fail-open; the downstream
 *     identity resolver handles the missing-profile case).
 */
export const ACCOUNT_STATUS_PORT = Symbol('IAccountStatusPort');

/** Who switched the account off. */
export type DeactivationOrigin = 'self' | 'admin';

export interface AccountStatus {
  isActive: boolean;
  deactivatedBy: DeactivationOrigin | null;
}

export interface IAccountStatusPort {
  getStatus(profileId: string): Promise<AccountStatus>;
}
