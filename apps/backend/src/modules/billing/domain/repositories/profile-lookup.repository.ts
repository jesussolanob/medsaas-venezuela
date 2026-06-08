/**
 * IProfileLookupRepository — narrow read-only port for resolving doctor identity.
 *
 * Used by billing use cases that need the doctor's email for invoice delivery.
 * This is intentionally a thin slice of the admin profile — billing must not
 * import the full IAdminRepository, which would create a cross-module dependency.
 *
 * PII note: `email` and `fullName` are doctor PII (admin-only context).
 * Never log these fields or expose them outside of super_admin-guarded flows.
 */
export interface DoctorProfileSnapshot {
  id: string;
  /** PII — full name. Admin-only context. */
  fullName: string;
  /** PII — email. Admin-only context. Do NOT log. */
  email: string;
}

export const PROFILE_LOOKUP_REPOSITORY = 'PROFILE_LOOKUP_REPOSITORY' as const;

export interface IProfileLookupRepository {
  /**
   * Finds a doctor profile by user ID.
   * Returns null when the profile does not exist.
   */
  findById(userId: string): Promise<DoctorProfileSnapshot | null>;
}
