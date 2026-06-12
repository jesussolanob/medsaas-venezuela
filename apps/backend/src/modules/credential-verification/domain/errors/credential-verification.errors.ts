import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when the requested doctor profile does not exist or is missing
 * required fields (cedula) to perform a verification.
 */
export class DoctorProfileNotFoundError extends DomainError {
  readonly code = 'DOCTOR_PROFILE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_doctorId?: string) {
    super('Doctor profile not found');
  }
}

/**
 * Raised when no active verifier is registered for the requested credential type.
 */
export class NoActiveVerifierError extends DomainError {
  readonly code = 'NO_ACTIVE_VERIFIER';
  override readonly httpStatus = 422;

  constructor(credentialType: string) {
    super(`No active verifier registered for credential type: ${credentialType}`);
  }
}

/**
 * Raised when the external verification portal returns an unexpected error
 * or the request fails at the infrastructure level.
 */
export class VerificationPortalError extends DomainError {
  readonly code = 'VERIFICATION_PORTAL_ERROR';
  override readonly httpStatus = 502;

  constructor(portalName: string) {
    super(`Verification portal error for: ${portalName}`);
  }
}

/**
 * Raised when a credential_verification record is not found.
 */
export class CredentialVerificationNotFoundError extends DomainError {
  readonly code = 'CREDENTIAL_VERIFICATION_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_doctorId?: string) {
    super('Credential verification record not found');
  }
}
