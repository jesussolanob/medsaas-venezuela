import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when a doctor attempts to trigger a calendar sync
 * but has not connected their Google Calendar account.
 *
 * HTTP 409 — the request cannot proceed until the prerequisite
 * (connecting Google Calendar) is fulfilled.
 */
export class CalendarNotConnectedError extends DomainError {
  readonly code = 'CALENDAR_NOT_CONNECTED';
  override readonly httpStatus = 409;

  constructor() {
    super('Conecta tu Google Calendar desde Configuración para sincronizar tus citas');
  }
}
