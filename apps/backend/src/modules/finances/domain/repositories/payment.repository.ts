import type { Payment, PaymentStatus } from '../entities/payment.entity';
import type { PaymentItem } from '../entities/payment-item.entity';

export const PAYMENT_REPOSITORY = 'PAYMENT_REPOSITORY';

/**
 * Enriched payment row with appointment and consultation join data.
 * Shape compatible with lib/finances.ts PaymentRow used by the frontend.
 */
export interface PaymentWithRelations {
  id: string;
  paymentCode: string | null;
  amountUsd: number;
  amountBs: number | null;
  status: PaymentStatus;
  paidAt: Date | null;
  methodSnapshot: string | null;
  createdAt: Date;
  appointment: {
    id: string;
    appointmentCode: string | null;
    scheduledAt: Date;
    patientName: string | null;
    planName: string | null;
    paymentReceiptUrl: string | null;
    consultationId: string | null;
  } | null;
  consultation: {
    consultationCode: string | null;
  } | null;
}

export interface PaymentListFilters {
  doctorId: string;
  status?: PaymentStatus | 'all';
  fromDate?: string;
  toDate?: string;
}

export interface PaymentTotals {
  approvedUsd: number;
  pendingUsd: number;
  approvedCount: number;
  pendingCount: number;
}

export interface AddPaymentItemInput {
  id: string;
  paymentId: string;
  doctorId: string;
  name: string;
  amountUsd: number;
  sourceType?: string | null;
  sourceId?: string | null;
}

export interface IPaymentRepository {
  /**
   * Lists payments for a doctor with appointment + consultation joins.
   * Results ordered by created_at DESC.
   * SECURITY: doctorId is from the authenticated caller — never from the request body.
   */
  listForDoctor(filters: PaymentListFilters): Promise<PaymentWithRelations[]>;

  /**
   * Aggregates totals (approved/pending) for a doctor.
   * Filters by date range if provided.
   */
  totalsForDoctor(filters: {
    doctorId: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<PaymentTotals>;

  /**
   * Finds a single payment by id, verifying ownership by doctorId.
   * Returns null when not found.
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<Payment | null>;

  /**
   * Updates the status of a payment, syncing consultations.payment_status.
   * The sync happens inside a transaction: either both succeed or both roll back.
   * SECURITY: doctorId enforces ownership — cannot update another doctor's payment.
   */
  updateStatus(id: string, doctorId: string, status: PaymentStatus): Promise<Payment>;

  /**
   * Adds a line item to a payment and recalculates payments.amount_usd.
   * Also syncs appointments.plan_price.
   * Runs inside a transaction.
   */
  addItem(item: AddPaymentItemInput): Promise<PaymentItem>;

  /**
   * Removes a line item and recalculates payments.amount_usd.
   * Also syncs appointments.plan_price.
   * SECURITY: doctorId verifies ownership on the parent payment.
   * Runs inside a transaction.
   */
  removeItem(itemId: string, doctorId: string): Promise<void>;

  /**
   * Lists all items for a payment, verifying doctor ownership.
   */
  listItems(paymentId: string, doctorId: string): Promise<PaymentItem[]>;

  /**
   * Attaches a payment receipt URL to a payment.
   * SECURITY: doctorId enforces ownership — cannot update another doctor's payment.
   * Throws PaymentNotFoundError (404) when not found.
   * Throws PaymentNotOwnedError (403) when ownership fails.
   */
  attachReceiptUrl(paymentId: string, doctorId: string, receiptUrl: string): Promise<Payment>;

  /**
   * Creates a new payment record. Used by CreateBookingUseCase.
   */
  create(params: {
    id: string;
    doctorId: string;
    patientId: string;
    amountUsd: number;
    amountBs?: number | null;
    bcvRate?: number | null;
    currency?: string;
    methodSnapshot?: string | null;
    paymentReference?: string | null;
    status?: PaymentStatus;
    packageId?: string | null;
    paymentCode?: string | null;
    transaction?: unknown;
  }): Promise<Payment>;
}
