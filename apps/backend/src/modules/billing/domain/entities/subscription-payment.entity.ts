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
}

/**
 * Domain entity for a subscription payment submitted by a doctor.
 *
 * Business rules:
 *  - Only 'pending' payments can transition to 'approved' or 'rejected'.
 *  - Once resolved, calling approve() or reject() throws SubscriptionPaymentAlreadyResolvedError.
 */
export class SubscriptionPayment {
  private constructor(private readonly props: SubscriptionPaymentProps) {}

  static create(props: SubscriptionPaymentProps): SubscriptionPayment {
    return new SubscriptionPayment({ ...props });
  }

  // ---------------------------------------------------------------------------
  // Getters
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
  reject(reviewerId: string): SubscriptionPayment {
    if (this.props.status !== 'pending') {
      throw new SubscriptionPaymentAlreadyResolvedError(this.props.id, this.props.status);
    }
    return new SubscriptionPayment({
      ...this.props,
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  toPlain(): SubscriptionPaymentProps {
    return { ...this.props };
  }
}
