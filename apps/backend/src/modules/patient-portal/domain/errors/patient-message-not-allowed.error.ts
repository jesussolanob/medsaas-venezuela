import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a patient attempts to send a message to a doctor they do not have
 * a patient relationship with (i.e. no patients row linking their auth_user_id
 * to the given doctor_id).
 */
export class PatientMessageNotAllowedError extends DomainError {
  readonly code = 'PATIENT_MESSAGE_NOT_ALLOWED';
  override readonly httpStatus = 403;

  constructor() {
    super('You do not have a patient relationship with this doctor');
  }
}
