import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when a doctor slot is already occupied by another appointment. */
export class AppointmentConflictError extends DomainError {
  readonly code = 'APPOINTMENT_CONFLICT';

  constructor(scheduledAt: Date) {
    super(`El horario de las ${scheduledAt.toISOString()} ya está ocupado`);
  }
}
