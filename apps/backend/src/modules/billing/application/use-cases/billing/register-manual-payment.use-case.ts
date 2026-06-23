import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
} from '../../../domain/repositories/subscription-payment.repository';
import {
  PROFILE_LOOKUP_REPOSITORY,
  type IProfileLookupRepository,
} from '../../../domain/repositories/profile-lookup.repository';
import { DoctorNotFoundError } from '../../../domain/errors/doctor-not-found.error';
import type { SubscriptionPaymentProps } from '../../../domain/entities/subscription-payment.entity';

export interface RegisterManualPaymentInput {
  doctorId: string;
  amountUsd: number;
  method: string;
  durationMonths: number;
  referenceNumber?: string;
  /** The super_admin's user id (from CurrentUser). */
  reviewerId: string;
}

export type RegisterManualPaymentOutput = SubscriptionPaymentProps;

/**
 * Registers a subscription payment that was collected directly (cash, wire transfer, etc.)
 * and immediately extends the doctor's subscription — all in a single atomic operation.
 *
 * Unlike the standard approve flow, this use case:
 *   - Creates the payment row with status='approved' from the start (no pending step).
 *   - Does NOT require an existing pending payment.
 *   - Verifies the target doctor exists before inserting anything.
 *
 * The subscription extension logic is identical to ApproveSubscriptionPaymentUseCase:
 *   extends from max(now, current_period_end) + duration_months.
 *
 * SECURITY: doctor existence check uses IProfileLookupRepository (admin-only port).
 * Never log the doctor's name, email, or any PII.
 */
@Injectable()
export class RegisterManualPaymentUseCase {
  private readonly logger = new Logger(RegisterManualPaymentUseCase.name);

  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
    @Inject(PROFILE_LOOKUP_REPOSITORY)
    private readonly profileRepo: IProfileLookupRepository,
  ) {}

  async execute(input: RegisterManualPaymentInput): Promise<RegisterManualPaymentOutput> {
    // 1. Verify the doctor exists (throws DoctorNotFoundError → 404 if not).
    const profile = await this.profileRepo.findById(input.doctorId);
    if (!profile) {
      throw new DoctorNotFoundError(input.doctorId);
    }

    // 2. Compute newExpiresAt extending from now (the subscription repo will
    //    look up the current period end internally and extend from max(now, end)).
    //    We pass newExpiresAt = now + durationMonths so the caller controls the math.
    //    This mirrors what ApproveSubscriptionPaymentUseCase does when no
    //    currentSubscriptionExpiresAt is passed (extends from now).
    const base = new Date();
    const newExpiresAt = new Date(base);
    newExpiresAt.setMonth(newExpiresAt.getMonth() + input.durationMonths);

    const paymentId = randomUUID();
    const reviewedAt = new Date();

    this.logger.debug(
      `[register-manual-payment] Creating manual payment paymentId=${paymentId} ` +
        `durationMonths=${input.durationMonths}`,
    );

    // 3. Atomic: create payment (approved) + extend subscription + log.
    const saved = await this.repo.saveApprovedAndExtend({
      id: paymentId,
      doctorId: input.doctorId,
      amountUsd: input.amountUsd,
      method: input.method,
      referenceNumber: input.referenceNumber ?? null,
      durationMonths: input.durationMonths,
      reviewerId: input.reviewerId,
      reviewedAt,
      newExpiresAt,
    });

    return saved.toPlain();
  }
}
