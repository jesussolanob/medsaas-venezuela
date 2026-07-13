import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when attempting to add two Money values with different currencies.
 */
export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';

  constructor() {
    super('No se pueden sumar montos en monedas distintas');
  }
}
