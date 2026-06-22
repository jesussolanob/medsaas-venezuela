/**
 * AccountStatusPort — narrow port for reading the is_active flag from a profile.
 *
 * Lives in infrastructure/auth/ to keep the AppAuthGuard self-contained without
 * coupling to a full domain repository from another module.
 *
 * Contract:
 *   - Returns true  when the profile is active (is_active IS NULL or true).
 *   - Returns false when is_active = false (account is hard-banned).
 *   - Returns true  when the profile row does not exist (fail-open; the downstream
 *     identity resolver will handle the missing-profile case).
 */
export const ACCOUNT_STATUS_PORT = Symbol('IAccountStatusPort');

export interface IAccountStatusPort {
  isActive(profileId: string): Promise<boolean>;
}
