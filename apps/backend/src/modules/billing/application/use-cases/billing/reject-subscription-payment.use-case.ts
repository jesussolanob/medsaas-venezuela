import { Inject, Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
} from '../../../domain/repositories/subscription-payment.repository';
import { SubscriptionPaymentNotFoundError } from '../../../domain/errors/subscription-payment-not-found.error';

export interface RejectSubscriptionPaymentInput {
  paymentId: string;
  reviewerId: string;
  reason?: string;
}

/**
 * Rejects a pending subscription payment.
 * Domain validation ensures only 'pending' payments can be rejected.
 */
@Injectable()
export class RejectSubscriptionPaymentUseCase {
  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
  ) {}

  async execute(input: RejectSubscriptionPaymentInput): Promise<void> {
    const payment = await this.repo.findById(input.paymentId);
    if (!payment) {
      throw new SubscriptionPaymentNotFoundError(input.paymentId);
    }

    // Domain validation: throws SubscriptionPaymentAlreadyResolvedError if not pending.
    payment.reject(input.reviewerId);

    await this.repo.reject(input.paymentId, input.reviewerId, input.reason);
  }
}
