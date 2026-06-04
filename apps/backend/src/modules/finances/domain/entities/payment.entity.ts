import { InvalidPaymentTransitionError } from '../errors/invalid-payment-transition.error';

export type PaymentStatus = 'pending' | 'approved';

/**
 * Domain entity representing the main financial record for a consultation/appointment.
 *
 * INVARIANT: The financial source of truth for doctor income.
 *   - status='approved' → money has been received (paidAt is set)
 *   - status='pending'  → payment has not yet been received
 *
 * NEVER derive income from appointments.status or consultations.payment_status.
 * Both fields are derived sync targets — the authoritative state lives here.
 */
export class Payment {
  private constructor(
    public readonly id: string,
    public readonly doctorId: string,
    public readonly patientId: string,
    public readonly amountUsd: number,
    public readonly amountBs: number | null,
    public readonly bcvRate: number | null,
    public readonly currency: string,
    public readonly methodSnapshot: string | null,
    public readonly paymentReference: string | null,
    public readonly paymentReceiptUrl: string | null,
    public readonly paymentCode: string | null,
    public readonly status: PaymentStatus,
    public readonly paidAt: Date | null,
    public readonly packageId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(params: {
    id: string;
    doctorId: string;
    patientId: string;
    amountUsd: number;
    amountBs?: number | null;
    bcvRate?: number | null;
    currency?: string;
    methodSnapshot?: string | null;
    paymentReference?: string | null;
    paymentReceiptUrl?: string | null;
    paymentCode?: string | null;
    status?: PaymentStatus;
    paidAt?: Date | null;
    packageId?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Payment {
    return new Payment(
      params.id,
      params.doctorId,
      params.patientId,
      params.amountUsd,
      params.amountBs ?? null,
      params.bcvRate ?? null,
      params.currency ?? 'USD',
      params.methodSnapshot ?? null,
      params.paymentReference ?? null,
      params.paymentReceiptUrl ?? null,
      params.paymentCode ?? null,
      params.status ?? 'pending',
      params.paidAt ?? null,
      params.packageId ?? null,
      params.createdAt,
      params.updatedAt,
    );
  }

  /**
   * Returns a new Payment with status='approved' and paidAt=now.
   * Throws InvalidPaymentTransitionError if already approved.
   */
  approve(): Payment {
    if (this.status === 'approved') {
      throw new InvalidPaymentTransitionError(this.id, 'approved', 'approved');
    }
    return new Payment(
      this.id,
      this.doctorId,
      this.patientId,
      this.amountUsd,
      this.amountBs,
      this.bcvRate,
      this.currency,
      this.methodSnapshot,
      this.paymentReference,
      this.paymentReceiptUrl,
      this.paymentCode,
      'approved',
      new Date(),
      this.packageId,
      this.createdAt,
      new Date(),
    );
  }

  /**
   * Returns a new Payment with status='pending' and paidAt=null.
   * Throws InvalidPaymentTransitionError if already pending.
   */
  markPending(): Payment {
    if (this.status === 'pending') {
      throw new InvalidPaymentTransitionError(this.id, 'pending', 'pending');
    }
    return new Payment(
      this.id,
      this.doctorId,
      this.patientId,
      this.amountUsd,
      this.amountBs,
      this.bcvRate,
      this.currency,
      this.methodSnapshot,
      this.paymentReference,
      this.paymentReceiptUrl,
      this.paymentCode,
      'pending',
      null,
      this.packageId,
      this.createdAt,
      new Date(),
    );
  }

  /** Anti-IDOR: confirm this payment belongs to the given doctor. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }
}
