import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when attempting to add two Money values with different currencies.
 */
export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';

  constructor() {
    super('Cannot add money values with different currencies');
  }
}
