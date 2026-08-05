import { SubscriptionPaymentAlreadyResolvedError } from '../errors/subscription-payment-already-resolved.error';

export type SubscriptionPaymentStatus = 'pending' | 'approved' | 'rejected';

export interface SubscriptionPaymentProps {
  id: string;
  doctorId: string;
  amountUsd: number;
  method: string;
  referenceNumber: string | null;
  durationMonths: number;
  status: SubscriptionPaymentStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // -------------------------------------------------------------------------
  // Fields added for doctor self-service checkout (B1 — migration 20260805000002)
  // Optional so existing callers do not need to pass them.
  // -------------------------------------------------------------------------
  /** Amount in Bolívares, server-calculated at submission time. */
  amountBs?: number | null;
  /** BCV rate (BS/USD) used at submission time. */
  bcvRateUsed?: number | null;
  /** Venezuelan bank institution code from VENEZUELAN_BANKS catalog. */
  bankCode?: string | null;
  /**
   * GCS object path (NOT a signed URL).
   * Sign on demand via STORAGE_PORT.getSignedUrl() — never persist the signed URL.
   */
  receiptUrl?: string | null;
  /** Optional doctor notes on the payment. */
  notes?: string | null;
  /** Which platform plan the doctor is paying for. */
  planKey?: string | null;
  /** Billing period: monthly | quarterly | semiannual | annual. */
  period?: string | null;
  /** Reason written by the super_admin when rejecting the payment. */
  rejectionReason?: string | null;
}

/**
 * Domain entity for a subscription payment submitted by a doctor.
 *
 * Business rules:
 *  - Only 'pending' payments can transition to 'approved' or 'rejected'.
 *  - Once resolved, calling approve() or reject() throws SubscriptionPaymentAlreadyResolvedError.
 *  - amountBs and bcvRateUsed are computed server-side; the domain never trusts client amounts.
 *  - receiptUrl stores the GCS path, not a signed URL (sign on demand).
 */
export class SubscriptionPayment {
  private constructor(private readonly props: SubscriptionPaymentProps) {}

  static create(props: SubscriptionPaymentProps): SubscriptionPayment {
    return new SubscriptionPayment({ ...props });
  }

  // ---------------------------------------------------------------------------
  // Core getters
  // ---------------------------------------------------------------------------

  get id(): string {
    return this.props.id;
  }

  get doctorId(): string {
    return this.props.doctorId;
  }

  get amountUsd(): number {
    return this.props.amountUsd;
  }

  get method(): string {
    return this.props.method;
  }

  get referenceNumber(): string | null {
    return this.props.referenceNumber;
  }

  get durationMonths(): number {
    return this.props.durationMonths;
  }

  get status(): SubscriptionPaymentStatus {
    return this.props.status;
  }

  get reviewedBy(): string | null {
    return this.props.reviewedBy;
  }

  get reviewedAt(): Date | null {
    return this.props.reviewedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // ---------------------------------------------------------------------------
  // Checkout-related getters (new fields — null for legacy rows)
  // ---------------------------------------------------------------------------

  get amountBs(): number | null {
    return this.props.amountBs ?? null;
  }

  get bcvRateUsed(): number | null {
    return this.props.bcvRateUsed ?? null;
  }

  get bankCode(): string | null {
    return this.props.bankCode ?? null;
  }

  /** GCS object path. NOT a signed URL — sign via STORAGE_PORT.getSignedUrl(). */
  get receiptUrl(): string | null {
    return this.props.receiptUrl ?? null;
  }

  get notes(): string | null {
    return this.props.notes ?? null;
  }

  get planKey(): string | null {
    return this.props.planKey ?? null;
  }

  get period(): string | null {
    return this.props.period ?? null;
  }

  get rejectionReason(): string | null {
    return this.props.rejectionReason ?? null;
  }

  // ---------------------------------------------------------------------------
  // Business logic
  // ---------------------------------------------------------------------------

  /**
   * Approves the payment. Only valid from 'pending'.
   * @throws SubscriptionPaymentAlreadyResolvedError if already resolved.
   */
  approve(reviewerId: string): SubscriptionPayment {
    if (this.props.status !== 'pending') {
      throw new SubscriptionPaymentAlreadyResolvedError(this.props.id, this.props.status);
    }
    return new SubscriptionPayment({
      ...this.props,
      status: 'approved',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Rejects the payment. Only valid from 'pending'.
   * @throws SubscriptionPaymentAlreadyResolvedError if already resolved.
   */
  reject(reviewerId: string, rejectionReason?: string): SubscriptionPayment {
    if (this.props.status !== 'pending') {
      throw new SubscriptionPaymentAlreadyResolvedError(this.props.id, this.props.status);
    }
    return new SubscriptionPayment({
      ...this.props,
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      rejectionReason: rejectionReason ?? this.props.rejectionReason ?? null,
      updatedAt: new Date(),
    });
  }

  toPlain(): SubscriptionPaymentProps {
    return { ...this.props };
  }
}
