/**
 * ISuggestionProfileLookupRepository — narrow read-only port for resolving
 * doctor identity when building the admin suggestions listing.
 *
 * Intentionally scoped to the suggestions module — suggestions must not import
 * the billing or admin profile repos (cross-module coupling).
 *
 * PII note: `fullName`, `email`, and `specialty` are doctor PII (admin-only
 * context). Never log these fields or expose them outside of super_admin-guarded
 * flows.
 */
export interface SuggestionDoctorProfile {
  id: string;
  /** PII — full name. Admin-only context. */
  fullName: string;
  /** PII — email. Admin-only context. Do NOT log. */
  email: string;
  /** Specialty (may be null for newly-registered doctors). */
  specialty: string | null;
}

export const SUGGESTION_PROFILE_LOOKUP_REPOSITORY = 'SUGGESTION_PROFILE_LOOKUP_REPOSITORY' as const;

export interface ISuggestionProfileLookupRepository {
  /**
   * Finds multiple doctor profiles by their user IDs in a single batched query
   * (no N+1). Returns only the profiles that exist; missing IDs are silently
   * omitted.
   */
  findByIds(userIds: string[]): Promise<SuggestionDoctorProfile[]>;
}
