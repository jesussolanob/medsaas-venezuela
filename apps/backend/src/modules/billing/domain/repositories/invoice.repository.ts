import type { Invoice } from '../entities/invoice.entity';

export const INVOICE_REPOSITORY = 'INVOICE_REPOSITORY';

export interface CreateInvoiceParams {
  id: string;
  doctorId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  description: string | null;
  createdBy: string | null;
}

export interface InvoiceListFilters {
  page: number;
  limit: number;
}

export interface InvoiceListResult {
  items: Invoice[];
  total: number;
  page: number;
  limit: number;
}

export interface IInvoiceRepository {
  /**
   * Returns the count of invoices — used to generate sequential invoice numbers.
   */
  countAll(): Promise<number>;

  /**
   * Lists all invoices (admin view), paginated.
   */
  list(filters: InvoiceListFilters): Promise<InvoiceListResult>;

  /**
   * Finds a single invoice by id.
   * Returns null when not found.
   */
  findById(id: string): Promise<Invoice | null>;

  /**
   * Persists a new invoice record.
   */
  save(params: CreateInvoiceParams): Promise<Invoice>;

  /**
   * Marks an invoice as paid (sets status='paid' and paid_at=now).
   */
  markPaid(id: string): Promise<Invoice>;
}
