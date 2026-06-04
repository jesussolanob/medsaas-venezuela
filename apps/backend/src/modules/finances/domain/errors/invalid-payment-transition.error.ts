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
      `Cannot transition payment ${paymentId} from '${currentStatus}' to '${targetStatus}' — already in that state`,
    );
  }
}
