import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when a doctor tries to cancel an appointment whose linked
 * consultation already has an APPROVED payment.
 *
 * Business rule (2026-08, point 11 of "lote de mejoras agosto"): once a
 * consultation's payment is approved, the money is not refunded and no
 * patient credit/balance is tracked (explicitly out of scope — "será
 * complicado manejar créditos ahora"). The only way to move a paid
 * appointment is to reschedule it: the payment stays linked to the
 * consultation, which stays linked to the appointment, so it simply
 * travels with the new date. See RescheduleAppointmentUseCase — it only
 * updates `scheduled_at`, never touching the consultation link.
 *
 * `code` is stable and used by the frontend to detect this specific case
 * and offer the reschedule flow instead of a generic error toast.
 *
 * HTTP 409 (conflict): mirrors AppointmentNotReschedulableError — the
 * request conflicts with the appointment's current state, and a different
 * action (reschedule) is the resolution.
 */
export class AppointmentCancelRequiresRescheduleError extends DomainError {
  readonly code = 'APPOINTMENT_CANCEL_REQUIRES_RESCHEDULE';
  override readonly httpStatus = 409;

  constructor() {
    super(
      'Esta cita ya tiene un pago aprobado y no se puede cancelar. ' +
        'Para cambiar la fecha, usa la opción de reagendar — el pago se mantiene vinculado a la nueva fecha.',
    );
  }
}
