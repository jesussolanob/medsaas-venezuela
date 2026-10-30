import { DomainError } from '../../../../domain/errors/domain.error';

export class TeamMeetingInvalidHostError extends DomainError {
  readonly code = 'TEAM_MEETING_INVALID_HOST';
  override readonly httpStatus = 422;
  constructor() {
    super(
      'El perfil seleccionado no tiene el rol de super administrador. Solo un super administrador puede ser el anfitrión de las reuniones.',
    );
  }
}
