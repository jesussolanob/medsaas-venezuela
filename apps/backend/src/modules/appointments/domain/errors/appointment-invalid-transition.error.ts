import { DomainError } from '../../../../domain/errors/domain.error';
import { appointmentStatusLabel } from '@delta/shared-types';
import type { AppointmentStatus } from '@delta/shared-types';

/**
 * Raised when a status change is not allowed from the appointment's current state.
 *
 * The message is read verbatim by the specialist, so it must name BOTH states in
 * the same words the screen uses and say what is still possible. The previous
 * version leaked raw enum values ("de 'cancelled' a 'no_show'") and the BFF
 * replaced it with "no se puede cambiar la cita a ese estado desde su estado
 * actual", which named neither. Between the two, a specialist could not tell
 * that her cancellation had already succeeded and kept retrying.
 */
export class AppointmentInvalidTransitionError extends DomainError {
  readonly code = 'APPOINTMENT_INVALID_TRANSITION';

  constructor(from: AppointmentStatus, to: AppointmentStatus, allowed: AppointmentStatus[] = []) {
    super(AppointmentInvalidTransitionError.buildMessage(from, to, allowed));
  }

  private static buildMessage(
    from: AppointmentStatus,
    to: AppointmentStatus,
    allowed: AppointmentStatus[],
  ): string {
    const head =
      `Esta cita ya está "${appointmentStatusLabel(from)}" ` +
      `y desde ahí no se puede marcar como "${appointmentStatusLabel(to)}".`;

    if (allowed.length === 0) {
      return (
        `${head} Es un estado final: no admite más cambios. ` +
        `Si la paciente va a venir, agendá una cita nueva.`
      );
    }

    const options = allowed.map((s) => `"${appointmentStatusLabel(s)}"`).join(', ');
    return `${head} Desde "${appointmentStatusLabel(from)}" solo se puede pasar a ${options}.`;
  }
}
