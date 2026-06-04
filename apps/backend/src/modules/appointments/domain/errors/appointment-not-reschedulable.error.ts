import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when a reschedule is attempted on an appointment that is not in a
 * reschedulable state (i.e. not scheduled or confirmed).
 */
export class AppointmentNotReschedulableError extends DomainError {
  readonly code = 'APPOINTMENT_NOT_RESCHEDULABLE';
  override readonly httpStatus = 409;

  constructor(currentStatus: string) {
    super(
      `Cannot reschedule an appointment in status "${currentStatus}". Only scheduled or confirmed appointments can be rescheduled.`,
    );
  }
}
