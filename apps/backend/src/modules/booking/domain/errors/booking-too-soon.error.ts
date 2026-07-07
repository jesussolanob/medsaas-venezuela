import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a booking request targets a date that does not satisfy the
 * doctor's minimum lead-time requirement (`booking_min_lead_days`).
 *
 * HTTP 400 Bad Request: the date chosen by the patient is valid but falls
 * within the restricted window configured by the doctor.
 */
export class BookingTooSoonError extends DomainError {
  readonly code = 'BOOKING_TOO_SOON';
  override readonly httpStatus = 400;

  constructor(minLeadDays: number) {
    super(`Las citas deben agendarse con al menos ${minLeadDays} día(s) de anticipación.`);
  }
}
