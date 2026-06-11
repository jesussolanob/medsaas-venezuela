import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the office_id provided for an appointment either does not
 * belong to the doctor (anti-IDOR) or does not support the requested
 * appointment modality.
 */
export class AppointmentOfficeInvalidError extends DomainError {
  readonly code = 'APPOINTMENT_OFFICE_INVALID';
  override readonly httpStatus = 422;

  constructor(reason: 'not_owned' | 'modality_mismatch') {
    const message =
      reason === 'not_owned'
        ? 'The specified office does not belong to this doctor'
        : 'The requested appointment mode is not supported by this office';
    super(message);
  }
}
