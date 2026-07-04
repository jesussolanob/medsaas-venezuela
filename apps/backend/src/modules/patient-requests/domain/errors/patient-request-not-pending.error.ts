import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an operation requires a pending request but the request
 * is already fulfilled or revoked.
 */
export class PatientRequestNotPendingError extends DomainError {
  readonly code = 'PATIENT_REQUEST_NOT_PENDING';
  override readonly httpStatus = 422;

  constructor() {
    super('Esta solicitud ya fue completada o revocada');
  }
}
