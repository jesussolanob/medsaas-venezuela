import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a payment cannot be located by the given id.
 * Maps to HTTP 404 via GlobalExceptionFilter.
 */
export class PaymentNotFoundError extends DomainError {
  readonly code = 'PAYMENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(readonly id: string) {
    super('El pago no existe');
  }
}
