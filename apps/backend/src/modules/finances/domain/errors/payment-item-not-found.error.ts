import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a payment item cannot be located by the given id.
 * Maps to HTTP 404 via GlobalExceptionFilter.
 */
export class PaymentItemNotFoundError extends DomainError {
  readonly code = 'PAYMENT_ITEM_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(readonly id: string) {
    super('El ítem de pago no existe');
  }
}
