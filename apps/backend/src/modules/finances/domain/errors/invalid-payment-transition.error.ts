import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an invalid payment status transition is attempted
 * (e.g. approving an already-approved payment).
 * Maps to HTTP 422 via GlobalExceptionFilter.
 */
export class InvalidPaymentTransitionError extends DomainError {
  readonly code = 'INVALID_PAYMENT_TRANSITION';

  constructor(paymentId: string, currentStatus: string, targetStatus: string) {
    super(
      `No se puede cambiar el estado del pago ${paymentId} de '${currentStatus}' a '${targetStatus}' — ya está en ese estado`,
    );
  }
}
