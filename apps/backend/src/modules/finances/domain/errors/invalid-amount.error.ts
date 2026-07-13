import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when constructing a Money value object with amount <= 0.
 */
export class InvalidAmountError extends DomainError {
  readonly code = 'INVALID_AMOUNT';

  constructor(amount: number) {
    super(`El monto debe ser mayor a cero; se recibió ${amount}`);
  }
}
