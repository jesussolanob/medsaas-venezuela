import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when `compare_at_price` is set but is not strictly greater than
 * `price_usd` for the same period.
 *
 * A "precio tachado" cheaper (or equal) to the real price is a data-entry
 * error, not a promotion: charging $10 while the crossed-out price is $8 makes
 * no sense. The caller must correct the value before retrying.
 */
export class CompareAtPriceInvalidError extends DomainError {
  readonly code = 'COMPARE_AT_PRICE_INVALID';

  constructor(period: string) {
    super(
      `El precio de referencia (tachado) para el período '${period}' debe ser mayor al precio real.`,
    );
  }
}
