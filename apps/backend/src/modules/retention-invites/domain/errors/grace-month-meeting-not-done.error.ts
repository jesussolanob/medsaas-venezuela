import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an admin tries to grant a grace month but the team meeting
 * has not been marked as done yet. Grace is only awarded post-meeting.
 */
export class GraceMonthMeetingNotDoneError extends DomainError {
  readonly code = 'GRACE_MONTH_MEETING_NOT_DONE';
  override readonly httpStatus = 422;
  constructor() {
    super('La reunión debe estar marcada como realizada antes de otorgar el mes de gracia.');
  }
}
