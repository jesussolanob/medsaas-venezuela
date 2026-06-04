export interface BillingDocumentItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface BillingDocumentProps {
  id: string;
  docNumber: string;
  docType: string;
  doctorId: string;
  consultationId: string | null;
  paymentId: string | null;
  patientId: string | null;
  items: BillingDocumentItem[];
  subtotal: number | null;
  total: number;
  ivaAmount: number;
  igtfAmount: number;
  bcvRate: number | null;
  totalBs: number | null;
  notes: string | null;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Domain entity for a billing document (factura, nota de débito, recibo, etc.).
 *
 * Items are stored as JSONB in the DB. The entity is responsible for keeping
 * the data coherent — the repository persists it as-is.
 */
export class BillingDocument {
  private constructor(private readonly props: BillingDocumentProps) {}

  static create(props: BillingDocumentProps): BillingDocument {
    return new BillingDocument({ ...props });
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get id(): string {
    return this.props.id;
  }

  get docNumber(): string {
    return this.props.docNumber;
  }

  get docType(): string {
    return this.props.docType;
  }

  get doctorId(): string {
    return this.props.doctorId;
  }

  get consultationId(): string | null {
    return this.props.consultationId;
  }

  get paymentId(): string | null {
    return this.props.paymentId;
  }

  get patientId(): string | null {
    return this.props.patientId;
  }

  get items(): BillingDocumentItem[] {
    return [...this.props.items];
  }

  get subtotal(): number | null {
    return this.props.subtotal;
  }

  get total(): number {
    return this.props.total;
  }

  get ivaAmount(): number {
    return this.props.ivaAmount;
  }

  get igtfAmount(): number {
    return this.props.igtfAmount;
  }

  get bcvRate(): number | null {
    return this.props.bcvRate;
  }

  get totalBs(): number | null {
    return this.props.totalBs;
  }

  get notes(): string | null {
    return this.props.notes;
  }

  get currency(): string {
    return this.props.currency;
  }

  get status(): string {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  toPlain(): BillingDocumentProps {
    return { ...this.props, items: [...this.props.items] };
  }
}
