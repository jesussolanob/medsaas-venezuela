import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor requests call_now outside support hours.
 * HTTP 422 — the request is understood but cannot be processed at this time.
 */
export class CallNowOutsideSupportHoursError extends DomainError {
  readonly code = 'CALL_NOW_OUTSIDE_SUPPORT_HOURS';

  constructor() {
    super('«Llámame ya» está disponible de lunes a sábado de 8:00 a. m. a 6:00 p. m.');
  }
}
