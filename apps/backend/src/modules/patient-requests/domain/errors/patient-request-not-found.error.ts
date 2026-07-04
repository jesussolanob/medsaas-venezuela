import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a patient request is not found by token or id+doctorId.
 *
 * SECURITY: returns 404 to prevent distinguishing between "not found" and
 * "owned by another doctor" (anti-enumeration, anti-IDOR).
 */
export class PatientRequestNotFoundError extends DomainError {
  readonly code = 'PATIENT_REQUEST_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('La solicitud no existe o ya no está disponible');
  }
}
