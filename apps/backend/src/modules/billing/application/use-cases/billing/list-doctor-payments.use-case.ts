import { Inject, Injectable } from '@nestjs/common';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
  type SubscriptionPaymentListResult,
} from '../../../domain/repositories/subscription-payment.repository';

export interface ListDoctorPaymentsInput {
  /** Taken from auth token (user.sub) — scopes the query to this doctor only. */
  doctorId: string;
  page?: number;
  limit?: number;
}

/**
 * Lists a doctor's own subscription payment history (scoped by doctorId — anti-IDOR).
 *
 * SECURITY: receiptUrl (raw GCS path) is deliberately excluded from the output.
 * If the doctor needs to view their comprobante, a separate signed-URL endpoint
 * should be added (not in the current scope).
 *
 * Returns: id, planKey, period, amountUsd, amountBs, bcvRateUsed, bankCode,
 *          referenceNumber, status, rejectionReason, createdAt, reviewedAt, hasReceipt.
 */
@Injectable()
export class ListDoctorPaymentsUseCase {
  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
  ) {}

  async execute(input: ListDoctorPaymentsInput): Promise<SubscriptionPaymentListResult> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(50, Math.max(1, input.limit ?? 20));

    return this.repo.listByDoctor(input.doctorId, page, limit);
  }
}
