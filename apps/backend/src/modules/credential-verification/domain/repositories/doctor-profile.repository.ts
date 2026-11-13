/**
 * IDoctorProfileRepository — read-only interface consumed by use cases
 * in the credential-verification module to fetch the doctor's cedula and
 * declared credential values.
 *
 * SECURITY: The fields returned are PII — callers MUST NOT log them.
 */
export const DOCTOR_PROFILE_FOR_VERIFICATION_REPOSITORY = Symbol(
  'IDoctorProfileForVerificationRepository',
);

export interface DoctorProfileForVerification {
  id: string;
  /** May be null if the doctor has not completed registration. */
  cedula: string | null;
  /** MPPS number declared by the doctor (e.g. 'MPPS-12345'). */
  mppsNumber: string | null;
  /** Full name for fuzzy matching against portal data. */
  fullName: string | null;
}

export interface IDoctorProfileForVerificationRepository {
  /**
   * Returns the profile fields needed for credential verification.
   * Returns null when the profile does not exist.
   */
  findById(doctorId: string): Promise<DoctorProfileForVerification | null>;

  /**
   * Conditionally promotes a doctor's profile to 'verified'.
   *
   * Executes:
   *   UPDATE profiles
   *   SET verification_status = 'verified', verified_at = NOW(), verified_by = NULL
   *   WHERE id = :doctorId AND verification_status = 'pending'
   *
   * The WHERE guard ensures:
   *   - 'rejected' profiles set by an admin are NEVER overridden.
   *   - Already-verified profiles are a no-op (idempotent).
   *
   * verified_by = NULL signals a system-automated verification (SACS match),
   * as opposed to a human admin action.
   *
   * SECURITY: Never log the doctorId combined with PII fields.
   */
  promoteToVerified(doctorId: string): Promise<void>;
}
