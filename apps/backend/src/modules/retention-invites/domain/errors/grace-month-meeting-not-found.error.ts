import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the requested team meeting does not exist.
 */
export class GraceMonthMeetingNotFoundError extends DomainError {
  readonly code = 'GRACE_MONTH_MEETING_NOT_FOUND';
  override readonly httpStatus = 404;
  constructor() {
    super('Reunión no encontrada.');
  }
}
