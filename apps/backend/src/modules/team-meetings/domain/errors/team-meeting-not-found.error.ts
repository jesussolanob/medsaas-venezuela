import { DomainError } from '../../../../domain/errors/domain.error';

export class TeamMeetingNotFoundError extends DomainError {
  readonly code = 'TEAM_MEETING_NOT_FOUND';
  override readonly httpStatus = 404;
  constructor() {
    super('Reunión no encontrada.');
  }
}
