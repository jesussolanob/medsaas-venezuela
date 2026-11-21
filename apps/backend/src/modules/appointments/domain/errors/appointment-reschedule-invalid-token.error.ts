import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a reschedule token is invalid, stale, or malformed.
 *
 * httpStatus 404 is deliberate anti-enumeration: we never expose whether a
 * given appointmentId exists to an unauthenticated caller.
 *
 * "Stale" means the appointment has already been rescheduled after this token
 * was generated (satMs mismatch) — the link in the WhatsApp message is expired.
 */
export class AppointmentRescheduleInvalidTokenError extends DomainError {
  readonly code = 'APPOINTMENT_RESCHEDULE_INVALID_TOKEN';
  override readonly httpStatus = 404;

  constructor() {
    super('La cita no existe o el enlace de reagendamiento no es válido o ya fue usado');
  }
}
