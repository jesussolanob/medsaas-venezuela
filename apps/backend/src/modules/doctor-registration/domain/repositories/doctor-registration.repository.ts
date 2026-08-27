import type {
  DoctorRegistration,
  VerificationStatus,
} from '../entities/doctor-registration.entity';

export const DOCTOR_REGISTRATION_REPOSITORY = Symbol('IDoctorRegistrationRepository');

export interface RegistrationUpdateParams {
  fullName: string;
  cedula: string;
  /** Teléfono de contacto — obligatorio desde 2026-08-17. Solo dígitos con país. */
  phone: string;
  mppsNumber: string | null;
  colegiadoNumber: string | null;
  specialty: string | null;
  gender?: string | null;
  /**
   * Whether to send the profile back to 'pending' verification.
   *
   * The verification an admin performs is over the identity documents (cédula,
   * MPPS, colegiado), so it only becomes stale when one of those changes. This
   * used to be unconditional, which meant an already-verified specialist who
   * walked back into the onboarding wizard and re-submitted the same data was
   * silently de-verified — with no notice to them and no trace of why.
   *
   * The caller decides, because only it can compare against the prior state.
   */
  resetVerification: boolean;
}

export interface VerificationUpdateParams {
  status: 'verified' | 'rejected';
  verifiedBy: string;
  verifiedAt: Date;
}

export interface TermsAcceptanceParams {
  acceptedAt: Date;
  version: string;
}

export interface SuperAdminRow {
  id: string;
  email: string;
  fullName: string;
}

export interface IDoctorRegistrationRepository {
  /**
   * Finds a doctor profile by its ID.
   * Returns null when no profile exists for the given id.
   */
  findById(doctorId: string): Promise<DoctorRegistration | null>;

  /**
   * Updates registration fields on the doctor's profile.
   * Always resets verification_status to 'pending'.
   * Throws DoctorRegistrationNotFoundError when the profile does not exist.
   */
  updateRegistration(
    doctorId: string,
    params: RegistrationUpdateParams,
  ): Promise<DoctorRegistration>;

  /**
   * Updates verification status, verified_at, and verified_by on the profile.
   * Throws DoctorRegistrationNotFoundError when the profile does not exist.
   */
  updateVerification(
    doctorId: string,
    params: VerificationUpdateParams,
  ): Promise<DoctorRegistration>;

  /**
   * Lists doctors filtered by verification_status.
   * Returns lightweight rows for admin display.
   * This is an admin-only operation — the caller must enforce @Roles('super_admin').
   */
  listByVerificationStatus(
    status: VerificationStatus,
    pagination: { limit: number; offset: number },
  ): Promise<DoctorRegistration[]>;

  /**
   * Returns all super_admin profiles (id + email) for notification dispatch.
   * SECURITY: call site must never log the returned email addresses.
   */
  findAllSuperAdmins(): Promise<SuperAdminRow[]>;

  /**
   * Persists the terms acceptance timestamp and version on the doctor's profile.
   * Sets terms_accepted_at = params.acceptedAt and terms_accepted_version = params.version.
   * Silently no-ops when the profile does not exist (best-effort, fire-and-forget caller).
   */
  acceptTerms(doctorId: string, params: TermsAcceptanceParams): Promise<void>;
}
