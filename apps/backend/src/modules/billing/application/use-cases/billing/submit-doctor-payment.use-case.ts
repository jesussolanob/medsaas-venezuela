import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  SUBSCRIPTION_PAYMENT_REPOSITORY,
  type ISubscriptionPaymentRepository,
} from '../../../domain/repositories/subscription-payment.repository';
import {
  PLATFORM_RATE_PROVIDER,
  type IPlatformRateProvider,
} from '../../../domain/repositories/platform-rate.provider';
import {
  PLAN_PRICE_PROVIDER,
  type IPlanPriceProvider,
} from '../../../domain/repositories/plan-price.provider';
import { PendingPaymentExistsError } from '../../../domain/errors/pending-payment-exists.error';
import { ReceiptPathNotOwnedError } from '../../../domain/errors/receipt-path-not-owned.error';

/** Billing periods and their duration in months. */
const PERIOD_DURATION_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export interface SubmitDoctorPaymentInput {
  /** Taken from auth token (user.sub) — NEVER from request body. */
  doctorId: string;
  planKey: string;
  period: string;
  /** Must be a valid Venezuelan bank code (validated by BankCodeSchema in DTO). */
  bankCode: string;
  referenceNumber: string;
  /**
   * GCS object path returned by POST /api/storage/upload (kind='receipt').
   * Must start with "receipt/{doctorId}/" — otherwise rejected (anti-IDOR check).
   */
  receiptPath: string;
  notes?: string;
}

export interface SubmitDoctorPaymentOutput {
  id: string;
  status: 'pending';
  /** Server-calculated USD amount. */
  amountUsd: number;
  /** Server-calculated Bolívar amount. */
  amountBs: number;
  /** BCV rate used for the conversion. */
  bcvRate: number;
}

/**
 * Submits a subscription payment comprobante on behalf of a doctor.
 *
 * SECURITY rules enforced here (defense in depth — primary validation is Zod at controller):
 *   1. doctorId comes from auth token, NEVER from the body.
 *   2. amountUsd, bcvRate, amountBs are ALWAYS server-calculated (never trusted from client).
 *   3. receiptPath must start with "receipt/{doctorId}/" — prevents IDOR on GCS paths.
 *   4. Anti-spam: only one pending payment at a time per doctor.
 *      HTTP-level rate limiting deferred to Etapa 2.
 *
 * RACE CONDITION (anti-spam, rule 4): findPendingByDoctor() below is a
 * fast-path check only — it gives a friendly PendingPaymentExistsError on the
 * common non-concurrent request, but two simultaneous requests from the same
 * doctor can both pass it before either INSERT commits. The DB-level unique
 * partial index uq_subscription_payments_one_pending_per_doctor (migration
 * 20260805000002) is the real guard: SequelizeSubscriptionPaymentRepository
 * .saveDoctorPayment() translates that constraint violation into the exact
 * same PendingPaymentExistsError, so this use case does not need its own
 * try/catch around repo.saveDoctorPayment() — both guards throw one
 * consistent domain error.
 */
@Injectable()
export class SubmitDoctorPaymentUseCase {
  constructor(
    @Inject(SUBSCRIPTION_PAYMENT_REPOSITORY)
    private readonly repo: ISubscriptionPaymentRepository,
    @Inject(PLATFORM_RATE_PROVIDER)
    private readonly rateProvider: IPlatformRateProvider,
    @Inject(PLAN_PRICE_PROVIDER)
    private readonly planPriceProvider: IPlanPriceProvider,
  ) {}

  async execute(input: SubmitDoctorPaymentInput): Promise<SubmitDoctorPaymentOutput> {
    // --- Anti-IDOR: validate receipt path ownership ---
    const expectedPrefix = `receipt/${input.doctorId}/`;
    if (!input.receiptPath.startsWith(expectedPrefix)) {
      throw new ReceiptPathNotOwnedError();
    }

    // --- Anti-spam: only one pending payment at a time ---
    const existingPending = await this.repo.findPendingByDoctor(input.doctorId);
    if (existingPending) {
      throw new PendingPaymentExistsError();
    }

    // --- Server-side price + rate calculation (never trust client amounts) ---
    // Fetched in parallel to minimise latency.
    const [priceInfo, rateResolution] = await Promise.all([
      this.planPriceProvider.getActivePlanPrice(input.planKey, input.period),
      this.rateProvider.getEffectiveRate(),
    ]);

    const amountUsd = priceInfo.priceUsd;
    const bcvRate = rateResolution.rate;
    // amountBs = round(amountUsd * bcvRate, 2)
    const amountBs = Math.round(amountUsd * bcvRate * 100) / 100;

    const durationMonths = PERIOD_DURATION_MONTHS[input.period] ?? 1;

    // Normalize reference number: strip whitespace (no internal spaces allowed per Zod schema).
    const referenceNumber = input.referenceNumber.trim();

    const payment = await this.repo.saveDoctorPayment({
      id: randomUUID(),
      doctorId: input.doctorId,
      amountUsd,
      amountBs,
      bcvRateUsed: bcvRate,
      method: 'transfer',
      referenceNumber,
      durationMonths,
      planKey: input.planKey,
      period: input.period,
      bankCode: input.bankCode,
      receiptUrl: input.receiptPath,
      notes: input.notes?.trim() ?? null,
    });

    return {
      id: payment.id,
      status: 'pending',
      amountUsd: payment.amountUsd,
      amountBs: payment.amountBs ?? amountBs,
      bcvRate,
    };
  }
}
