import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a booking request is missing a chief complaint (motivo de
 * consulta) and the doctor has configured `booking_require_reason = true`.
 *
 * HTTP 400 Bad Request: the request is structurally valid but violates a
 * doctor-defined booking rule.
 */
export class ChiefComplaintRequiredError extends DomainError {
  readonly code = 'CHIEF_COMPLAINT_REQUIRED';
  override readonly httpStatus = 400;

  constructor() {
    super('Debes indicar el motivo de la consulta.');
  }
}
