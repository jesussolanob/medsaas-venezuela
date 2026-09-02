import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a VES-priced product cannot be converted to USD because the
 * `usdt_rate` row is missing or zero in `app_settings`.
 *
 * A VES price falling through to USD without conversion would silently charge
 * the wrong currency amount (e.g., Bs. 1500 billed as US$ 1500).
 */
export class MissingExchangeRateError extends DomainError {
  readonly code = 'MISSING_EXCHANGE_RATE';

  constructor() {
    super('Tasa de cambio no disponible. Configure la tasa USD/VES en ajustes antes de aprobar.');
  }
}
