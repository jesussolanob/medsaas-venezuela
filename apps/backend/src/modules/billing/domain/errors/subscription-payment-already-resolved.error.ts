import { DomainError } from '../../../../domain/errors/domain.error';
import type { SubscriptionPaymentStatus } from '../entities/subscription-payment.entity';

/**
 * Thrown when attempting to approve or reject a subscription payment that has
 * already been resolved (approved or rejected).
 * Maps to HTTP 422 via GlobalExceptionFilter.
 */
export class SubscriptionPaymentAlreadyResolvedError extends DomainError {
  readonly code = 'SUBSCRIPTION_PAYMENT_ALREADY_RESOLVED';

  constructor(id: string, currentStatus: SubscriptionPaymentStatus) {
    super(`Subscription payment ${id} is already resolved (status: ${currentStatus})`);
  }
}
