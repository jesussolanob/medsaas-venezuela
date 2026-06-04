import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a subscription payment cannot be found by the given id.
 * Maps to HTTP 404 via GlobalExceptionFilter.
 */
export class SubscriptionPaymentNotFoundError extends DomainError {
  readonly code = 'SUBSCRIPTION_PAYMENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(id: string) {
    super(`Subscription payment not found: ${id}`);
  }
}
