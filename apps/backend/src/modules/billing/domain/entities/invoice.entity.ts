import { InvoiceNotFoundError } from '../errors/invoice-not-found.error';

export type InvoiceStatus = 'issued' | 'sent' | 'paid';

export interface InvoiceProps {
  id: string;
  doctorId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  description: string | null;
  status: InvoiceStatus;
  issuedAt: Date | null;
  sentAt: Date | null;
  paidAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Domain entity for a platform invoice issued to a doctor.
 *
 * Business rule: markPaid() is only meaningful when not already 'paid',
 * but we allow calling it idempotently (re-marking paid does nothing harmful).
 */
export class Invoice {
  private constructor(private readonly props: InvoiceProps) {}

  static create(props: InvoiceProps): Invoice {
    return new Invoice({ ...props });
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

  get invoiceNumber(): string {
    return this.props.invoiceNumber;
  }

  get amount(): number {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }

  get description(): string | null {
    return this.props.description;
  }

  get status(): InvoiceStatus {
    return this.props.status;
  }

  get issuedAt(): Date | null {
    return this.props.issuedAt;
  }

  get sentAt(): Date | null {
    return this.props.sentAt;
  }

  get paidAt(): Date | null {
    return this.props.paidAt;
  }

  get createdBy(): string | null {
    return this.props.createdBy;
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
   * Marks the invoice as sent, recording the sent timestamp.
   * Calling this on an already-sent (or paid) invoice is idempotent —
   * returns an updated copy with the same sentAt.
   */
  markSent(): Invoice {
    const now = new Date();
    return new Invoice({
      ...this.props,
      status: this.props.status === 'paid' ? 'paid' : 'sent',
      sentAt: this.props.sentAt ?? now,
      updatedAt: now,
    });
  }

  /**
   * Marks the invoice as paid, recording the paid timestamp.
   * Calling this on an already-paid invoice returns an updated copy with the
   * same paidAt (idempotent by design — marking paid twice is not a domain error).
   */
  markPaid(): Invoice {
    const now = new Date();
    return new Invoice({
      ...this.props,
      status: 'paid',
      paidAt: this.props.paidAt ?? now,
      updatedAt: now,
    });
  }

  toPlain(): InvoiceProps {
    return { ...this.props };
  }
}

// Re-export so callers who import from entity can access the error without an
// extra import, while keeping domain/ free of cross-module deps.
export { InvoiceNotFoundError };
