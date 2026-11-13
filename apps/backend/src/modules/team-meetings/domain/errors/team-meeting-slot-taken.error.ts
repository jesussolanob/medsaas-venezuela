import { DomainError } from '../../../../domain/errors/domain.error';

export class TeamMeetingSlotTakenError extends DomainError {
  readonly code = 'TEAM_MEETING_SLOT_TAKEN';
  override readonly httpStatus = 409;
  constructor() {
    super('El horario seleccionado ya no está disponible. Por favor, elige otro.');
  }
}
