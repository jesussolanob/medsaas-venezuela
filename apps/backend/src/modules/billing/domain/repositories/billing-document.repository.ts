import type { BillingDocument, BillingDocumentItem } from '../entities/billing-document.entity';

export const BILLING_DOCUMENT_REPOSITORY = 'BILLING_DOCUMENT_REPOSITORY';

export interface CreateBillingDocumentParams {
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
}

export interface BillingDocumentListFilters {
  doctorId: string;
  page: number;
  limit: number;
}

export interface BillingDocumentListResult {
  items: BillingDocument[];
  total: number;
  page: number;
  limit: number;
}

export interface IBillingDocumentRepository {
  /**
   * Returns the count of documents for a given docType — used to generate
   * sequential doc numbers per type.
   */
  countByType(docType: string): Promise<number>;

  /**
   * Lists billing documents scoped to a doctor (anti-IDOR), paginated.
   */
  listForDoctor(filters: BillingDocumentListFilters): Promise<BillingDocumentListResult>;

  /**
   * Persists a new billing document.
   */
  save(params: CreateBillingDocumentParams): Promise<BillingDocument>;
}
