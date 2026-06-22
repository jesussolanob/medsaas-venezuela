import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
} from '../../../domain/repositories/subscription-payment.repository';
import {
  PROFILE_LOOKUP_REPOSITORY,
  type IProfileLookupRepository,
} from '../../../domain/repositories/profile-lookup.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';
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
 *
 * After committing, a non-fatal `payment_approved` email is sent to the doctor.
 * Email failure does NOT roll back the approval — the subscription extension is
 * the source of truth, not the notification.
 *
 * SECURITY:
 *   - Doctor email is admin-only PII. Never log it.
 *   - Log only the payment ID and whether the email was dispatched.
 */
@Injectable()
export class ApproveSubscriptionPaymentUseCase {
  private readonly logger = new Logger(ApproveSubscriptionPaymentUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
    @Inject(PROFILE_LOOKUP_REPOSITORY)
    private readonly profileRepo: IProfileLookupRepository,
    private readonly mailerService: MailerService,
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

    // Non-fatal: send payment_approved email to the doctor.
    // The approval is already committed — email failure must not affect it.
    void this.sendPaymentApprovedEmail(payment.doctorId, payment.amountUsd, input.paymentId);

    return { newExpiresAt };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fires the payment_approved transactional email.
   * Errors are swallowed and logged (without PII) so the caller is never affected.
   */
  private async sendPaymentApprovedEmail(
    doctorId: string,
    amountUsd: number,
    paymentId: string,
  ): Promise<void> {
    try {
      const profile = await this.profileRepo.findById(doctorId);
      if (!profile) {
        this.logger.warn(
          `[approve-payment] Doctor profile not found for payment=${paymentId} — email skipped`,
        );
        return;
      }

      const dateFormatted = new Date().toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      await this.mailerService.sendTemplate(
        'payment_approved',
        profile.email,
        {
          doctorName: profile.fullName,
          amount: `USD ${amountUsd.toFixed(2)}`,
          date: dateFormatted,
        },
        { type: 'doctor', id: doctorId },
      );

      this.logger.debug(
        `[approve-payment] payment_approved email dispatched for payment=${paymentId}`,
      );
    } catch (err: unknown) {
      // Log without PII (no email, no name, no amount that could identify the doctor)
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(
        `[approve-payment] payment_approved email failed for payment=${paymentId}: ${message}`,
      );
    }
  }
}
