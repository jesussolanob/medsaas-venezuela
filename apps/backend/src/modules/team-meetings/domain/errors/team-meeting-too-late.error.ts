import { DomainError } from '../../../../domain/errors/domain.error';

export class TeamMeetingTooLateError extends DomainError {
  readonly code = 'TEAM_MEETING_TOO_LATE';
  override readonly httpStatus = 422;
  constructor() {
    super('No es posible modificar la reunión a menos de 2 horas del horario confirmado.');
  }
}
