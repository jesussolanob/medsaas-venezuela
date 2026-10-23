/**
 * IProfileLookupRepository — narrow read-only port for resolving doctor identity.
 *
 * Used by billing use cases that need the doctor's email for invoice delivery
 * and by the admin list endpoint to enrich payment rows with doctor identity.
 * This is intentionally a thin slice of the admin profile — billing must not
 * import the full IAdminRepository, which would create a cross-module dependency.
 *
 * PII note: `email`, `fullName`, and `specialty` are doctor PII (admin-only
 * context). Never log these fields or expose them outside of super_admin-guarded
 * flows.
 */
export interface DoctorProfileSnapshot {
  id: string;
  /** PII — full name. Admin-only context. */
  fullName: string;
  /** PII — email. Admin-only context. Do NOT log. */
  email: string;
  /** Specialty (may be null for newly-registered doctors). Admin-only context. */
  specialty: string | null;
}

export const PROFILE_LOOKUP_REPOSITORY = 'PROFILE_LOOKUP_REPOSITORY' as const;

export interface IProfileLookupRepository {
  /**
   * Finds a doctor profile by user ID.
   * Returns null when the profile does not exist.
   */
  findById(userId: string): Promise<DoctorProfileSnapshot | null>;

  /**
   * Finds multiple doctor profiles by their user IDs in a single batched query
   * (no N+1). Returns only the profiles that exist; missing IDs are silently
   * omitted. Callers should treat a missing entry as an unknown doctor.
   */
  findByIds(userIds: string[]): Promise<DoctorProfileSnapshot[]>;
}
