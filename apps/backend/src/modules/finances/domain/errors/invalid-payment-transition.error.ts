import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an invalid payment status transition is attempted
 * (e.g. approving an already-approved payment).
 * Maps to HTTP 422 via GlobalExceptionFilter.
 */
export class InvalidPaymentTransitionError extends DomainError {
  readonly code = 'INVALID_PAYMENT_TRANSITION';

  constructor(
    readonly paymentId: string,
    readonly currentStatus: string,
    readonly targetStatus: string,
  ) {
    super('El pago ya se encuentra en ese estado');
  }
}
