import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when the same patient already has an appointment that OVERLAPS the new
 * slot (cross-doctor — a patient cannot be in two places at once).
 */
export class AppointmentDuplicateError extends DomainError {
  readonly code = 'APPOINTMENT_DUPLICATE';

  constructor(patientId: string, scheduledAt: Date) {
    super(
      `Patient ${patientId} already has an appointment overlapping ${scheduledAt.toISOString()}`,
    );
  }
}
