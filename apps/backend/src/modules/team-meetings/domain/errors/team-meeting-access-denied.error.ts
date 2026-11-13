import { DomainError } from '../../../../domain/errors/domain.error';

export class TeamMeetingAccessDeniedError extends DomainError {
  readonly code = 'TEAM_MEETING_ACCESS_DENIED';
  override readonly httpStatus = 403;
  constructor() {
    super('No tienes permiso para modificar esta reunión.');
  }
}
