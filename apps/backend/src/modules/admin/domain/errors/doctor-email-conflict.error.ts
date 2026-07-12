import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an admin attempts to create a doctor with an email address
 * that already exists in the profiles table.
 */
export class DoctorEmailConflictError extends DomainError {
  readonly code = 'DOCTOR_EMAIL_CONFLICT';
  override readonly httpStatus = 409;

  constructor(email: string) {
    super(`A profile with email '${email}' already exists`);
  }
}
