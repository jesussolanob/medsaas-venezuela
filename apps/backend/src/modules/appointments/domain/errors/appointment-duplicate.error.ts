import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when the same patient already has an appointment within ±15 minutes of the slot. */
export class AppointmentDuplicateError extends DomainError {
  readonly code = 'APPOINTMENT_DUPLICATE';

  constructor(patientId: string, scheduledAt: Date) {
    super(
      `Patient ${patientId} already has an appointment near ${scheduledAt.toISOString()} (±15 min)`,
    );
  }
}
