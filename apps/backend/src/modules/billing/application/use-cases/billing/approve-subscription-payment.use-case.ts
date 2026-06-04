import { Inject, Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
} from '../../../domain/repositories/subscription-payment.repository';
import { SubscriptionPaymentNotFoundError } from '../../../domain/errors/subscription-payment-not-found.error';

export interface ApproveSubscriptionPaymentInput {
  paymentId: string;
  reviewerId: string;
  /** Optional: current subscription expiration for the doctor (to extend from) */
  currentSubscriptionExpiresAt?: Date | null;
}

export interface ApproveSubscriptionPaymentOutput {
  newExpiresAt: Date;
}

/**
 * Approves a pending subscription payment and extends the doctor's subscription.
 *
 * Transactional steps (delegated to the repository):
 *   (a) Mark subscription_payment approved
 *   (b) Extend subscriptions.current_period_end (from max(now, current) + months)
 *   (c) Sync profiles snapshot (subscription_status='active', subscription_expires_at)
 *   (d) Insert subscription_changes_log
 */
@Injectable()
export class ApproveSubscriptionPaymentUseCase {
  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
  ) {}

  async execute(input: ApproveSubscriptionPaymentInput): Promise<ApproveSubscriptionPaymentOutput> {
    const payment = await this.repo.findById(input.paymentId);
    if (!payment) {
      throw new SubscriptionPaymentNotFoundError(input.paymentId);
    }

    // Domain validation: throws SubscriptionPaymentAlreadyResolvedError if not pending.
    const approved = payment.approve(input.reviewerId);

    // Compute newExpiresAt: extend from future date or now (whichever is later).
    const base =
      input.currentSubscriptionExpiresAt && input.currentSubscriptionExpiresAt > new Date()
        ? input.currentSubscriptionExpiresAt
        : new Date();

    const newExpiresAt = new Date(base);
    newExpiresAt.setMonth(newExpiresAt.getMonth() + payment.durationMonths);

    await this.repo.approveAndExtend(
      {
        paymentId: approved.id,
        reviewerId: input.reviewerId,
        newExpiresAt,
      },
      {
        amountUsd: payment.amountUsd,
        method: payment.method,
        referenceNumber: payment.referenceNumber,
        monthsAdded: payment.durationMonths,
        actorRole: 'super_admin',
      },
    );

    return { newExpiresAt };
  }
}
