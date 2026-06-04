import { PaymentAlreadyResolvedError } from '../errors/payment-already-resolved.error';

export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export interface ConsultationPaymentCreateParams {
  id: string;
  consultationId: string;
  doctorId: string;
  patientId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  referenceNumber: string | null;
  receiptUrl: string | null;
  notes: string | null;
  status: PaymentStatus;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ConsultationPayment domain entity.
 *
 * Invariants:
 *   - approve() and reject() are only valid when status is 'pending'.
 *   - Attempting a transition from 'approved' or 'rejected' throws
 *     PaymentAlreadyResolvedError (idempotency guard).
 *
 * SECURITY: doctorId is embedded in the entity so the presentation layer can
 * enforce anti-IDOR by comparing it to the authenticated user without coupling
 * to the persistence layer.
 *
 * No PHI is stored on this entity: amount, currency, payment_method,
 * reference_number, receipt_url, and notes are financial metadata, not patient
 * personal identifiers. They are stored in plaintext per the CLAUDE.md
 * encryption policy (only full_name/cedula/phone/email/diagnosis/treatment/
 * medication_name are encrypted).
 */
export class ConsultationPayment {
  readonly id: string;
  readonly consultationId: string;
  readonly doctorId: string;
  readonly patientId: string;
  readonly amount: number;
  readonly currency: string;
  readonly paymentMethod: string;
  readonly referenceNumber: string | null;
  readonly receiptUrl: string | null;
  readonly notes: string | null;
  readonly status: PaymentStatus;
  readonly approvedAt: Date | null;
  readonly approvedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: ConsultationPaymentCreateParams) {
    this.id = params.id;
    this.consultationId = params.consultationId;
    this.doctorId = params.doctorId;
    this.patientId = params.patientId;
    this.amount = params.amount;
    this.currency = params.currency;
    this.paymentMethod = params.paymentMethod;
    this.referenceNumber = params.referenceNumber;
    this.receiptUrl = params.receiptUrl;
    this.notes = params.notes;
    this.status = params.status;
    this.approvedAt = params.approvedAt;
    this.approvedBy = params.approvedBy;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  /**
   * Returns true when this payment belongs to the given doctor.
   * Used for anti-IDOR enforcement on all read and write paths.
   */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Returns true when the payment is still pending (not yet resolved).
   * A pending payment can be approved or rejected.
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Transition: pending → approved.
   *
   * Returns a new ConsultationPayment with status 'approved' and the given
   * approvedBy and approvedAt values. Never mutates the current instance.
   *
   * Throws PaymentAlreadyResolvedError if the payment is not in 'pending' state.
   */
  approve(approvedBy: string): ConsultationPayment {
    if (!this.isPending()) {
      throw new PaymentAlreadyResolvedError(this.status);
    }
    return new ConsultationPayment({
      ...this.toParams(),
      status: 'approved',
      approvedAt: new Date(),
      approvedBy,
      updatedAt: new Date(),
    });
  }

  /**
   * Transition: pending → rejected.
   *
   * Returns a new ConsultationPayment with status 'rejected'. Never mutates.
   *
   * Throws PaymentAlreadyResolvedError if the payment is not in 'pending' state.
   */
  reject(): ConsultationPayment {
    if (!this.isPending()) {
      throw new PaymentAlreadyResolvedError(this.status);
    }
    return new ConsultationPayment({
      ...this.toParams(),
      status: 'rejected',
      updatedAt: new Date(),
    });
  }

  /** Factory — creates a ConsultationPayment from raw data. Does not persist. */
  static create(params: ConsultationPaymentCreateParams): ConsultationPayment {
    return new ConsultationPayment(params);
  }

  private toParams(): ConsultationPaymentCreateParams {
    return {
      id: this.id,
      consultationId: this.consultationId,
      doctorId: this.doctorId,
      patientId: this.patientId,
      amount: this.amount,
      currency: this.currency,
      paymentMethod: this.paymentMethod,
      referenceNumber: this.referenceNumber,
      receiptUrl: this.receiptUrl,
      notes: this.notes,
      status: this.status,
      approvedAt: this.approvedAt,
      approvedBy: this.approvedBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
