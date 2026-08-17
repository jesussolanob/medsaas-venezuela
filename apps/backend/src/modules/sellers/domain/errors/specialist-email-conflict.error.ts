import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a seller tries to create a specialist whose email is already
 * registered in the system.
 *
 * HTTP 409 Conflict — the email already exists and cannot be duplicated.
 *
 * NOTE: The email is intentionally omitted from the message to reduce the
 * risk of PII leaking into error responses logged by monitoring systems.
 * The HTTP 409 code is sufficient for the client to display the right copy.
 */
export class SpecialistEmailConflictError extends DomainError {
  readonly code = 'DOCTOR_EMAIL_CONFLICT';
  override readonly httpStatus = 409;

  constructor() {
    super('Este correo ya está registrado en el sistema.');
  }
}
