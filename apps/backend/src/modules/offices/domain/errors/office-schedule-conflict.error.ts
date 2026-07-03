import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a new or updated office schedule overlaps with an existing
 * active office for the same doctor.
 *
 * Two time windows on the same day overlap when:
 *   startA < endB AND startB < endA (half-open interval comparison).
 *
 * HTTP 409 Conflict — the client should adjust schedule times before retrying.
 */
export class OfficeScheduleConflictError extends DomainError {
  readonly code = 'OFFICE_SCHEDULE_CONFLICT';
  override readonly httpStatus = 409;

  constructor(day?: number) {
    const dayLabel = day !== undefined ? ` (day ${day})` : '';
    super(`The office schedule${dayLabel} overlaps with an existing active office for this doctor`);
  }
}
