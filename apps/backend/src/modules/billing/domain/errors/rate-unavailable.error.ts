import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when no BCV exchange rate can be resolved from any source
 * (Redis, app_settings, or external APIs).
 *
 * Convention: NEVER return 0 or NaN as a rate. If the rate is unavailable,
 * this error must be thrown so the caller surfaces a clear message.
 *
 * Maps to HTTP 503 (service temporarily unavailable).
 */
export class RateUnavailableError extends DomainError {
  readonly code = 'RATE_UNAVAILABLE';
  override readonly httpStatus = 503;

  constructor() {
    super(
      'La tasa de cambio BCV no está disponible en este momento. ' +
        'Por favor, intente nuevamente en unos minutos.',
    );
  }
}
