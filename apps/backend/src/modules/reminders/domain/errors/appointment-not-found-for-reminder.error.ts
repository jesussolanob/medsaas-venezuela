import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the appointment (or consultation) referenced in a manual
 * reminder request cannot be found, or does not belong to the requesting doctor.
 *
 * Returns HTTP 404 to match the "resource not found" convention and to avoid
 * revealing whether the ID exists under a different doctor (anti-IDOR).
 */
export class AppointmentNotFoundForReminderError extends DomainError {
  readonly code = 'REMINDER_APPOINTMENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(id: string) {
    super(`Cita no encontrada: ${id}`);
  }
}
