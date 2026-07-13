import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an actor tries to access or modify a payment that does not
 * belong to their doctor account. Maps to HTTP 403 via GlobalExceptionFilter.
 *
 * SECURITY: Never reveal whether the resource exists. The message is generic.
 */
export class PaymentNotOwnedError extends DomainError {
  readonly code = 'PAYMENT_NOT_OWNED';
  override readonly httpStatus = 403;

  constructor() {
    super('No tienes permiso para modificar este pago');
  }
}
