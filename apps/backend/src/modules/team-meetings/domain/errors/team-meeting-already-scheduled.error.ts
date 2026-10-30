import { DomainError } from '../../../../domain/errors/domain.error';

export class TeamMeetingAlreadyScheduledError extends DomainError {
  readonly code = 'TEAM_MEETING_ALREADY_SCHEDULED';
  override readonly httpStatus = 409;
  constructor() {
    super(
      'Ya tienes una reunión agendada con el equipo de Delta. Cancela la existente antes de agendar una nueva.',
    );
  }
}
