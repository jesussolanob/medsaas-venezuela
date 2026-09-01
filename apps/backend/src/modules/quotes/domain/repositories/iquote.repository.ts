import type { Quote, QuoteStatus } from '../entities/quote.entity';
import type { QuoteItem } from '../entities/quote-item.entity';
import type { QuoteShareLink } from '../entities/quote-share-link.entity';

export const QUOTE_REPOSITORY = 'QUOTE_REPOSITORY';

// ---------------------------------------------------------------------------
// Filter / paginated result types
// ---------------------------------------------------------------------------

export interface QuoteListFilters {
  doctorId: string;
  status?: QuoteStatus;
  /** Free-text filter on item name or description (SQL ILIKE on quote_items.name). */
  productName?: string;
  /**
   * Pre-resolved patient IDs for the patient name filter.
   *
   * Patient names are AES-256-GCM encrypted — no SQL LIKE is possible.
   * The use case resolves the name → IDs by fetching all patients for the
   * doctor and decrypting in-memory, then passes the matching IDs here.
   * When present and empty, the repository returns an empty result immediately.
   */
  patientIds?: string[];
  page: number;
  limit: number;
}

export interface QuoteListResult {
  items: Quote[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Create / update input types
// ---------------------------------------------------------------------------

export interface CreateQuoteItemParams {
  kind: 'service' | 'product';
  sourceId: string | null;
  name: string;
  description: string;
  quantity: number;
  unitPriceUsd: number;
  sortOrder: number;
}

export interface CreateQuoteParams {
  doctorId: string;
  patientId: string | null;
  leadId: string | null;
  validUntil: Date | null;
  notes: string;
  discountUsd: number;
  items: CreateQuoteItemParams[];
}

export interface UpdateQuoteParams {
  patientId?: string | null;
  leadId?: string | null;
  validUntil?: Date | null;
  notes?: string;
  discountUsd?: number;
  items?: CreateQuoteItemParams[];
}

export interface SendQuoteParams {
  bcvRate: number | null;
  totalBs: number | null;
  shareLink: QuoteShareLink;
}

// ---------------------------------------------------------------------------
// IQuoteRepository contract
// ---------------------------------------------------------------------------

/**
 * Contract for quote persistence.
 *
 * Separation of concerns:
 *   - quote_number is generated atomically by the repository (Postgres advisory
 *     lock + MAX within transaction). The use case never generates it.
 *   - totalUsd = Σ(amount_usd) − discount_usd is ALWAYS computed here before
 *     persisting; the value from the client is discarded.
 *   - validateItemSources() checks sourceIds against the catalog before saving.
 */
export interface IQuoteRepository {
  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /** Paginated list scoped to doctorId. Optional status + product name filters. */
  list(filters: QuoteListFilters): Promise<QuoteListResult>;

  /**
   * Finds a quote by ID scoped to doctorId (with its items).
   * Returns null when ID does not exist or belongs to another doctor.
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<Quote | null>;

  /**
   * Finds a quote share link by token.
   * Returns null when the token does not exist.
   */
  findShareLinkByToken(token: string): Promise<QuoteShareLink | null>;

  /**
   * Finds the quote associated with a valid (non-expired, non-revoked) share link.
   * Returns null when the link is not found, expired, or revoked.
   */
  findQuoteByValidToken(token: string): Promise<Quote | null>;

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  /**
   * Validates that all provided sourceIds belong to the doctor.
   * Items without a sourceId are skipped.
   *
   * @throws {QuoteItemSourceNotFoundError} for any invalid sourceId.
   */
  validateItemSources(
    items: Array<{ kind: 'service' | 'product'; sourceId: string | null }>,
    doctorId: string,
  ): Promise<void>;

  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  /**
   * Creates a quote with its items atomically.
   * - Generates quote_number atomically (advisory lock).
   * - Computes amountUsd per item and total_usd in the repository.
   * - Inserts quote + all items in one transaction.
   *
   * Returns the newly created quote WITH items.
   */
  create(params: CreateQuoteParams): Promise<Quote>;

  /**
   * Updates a quote and optionally replaces its items (replace-all pattern).
   * - Only items array: replaces ALL existing items.
   * - Recomputes totalUsd after any item change.
   * - Throws QuoteNotFoundError when not found or not owned.
   */
  update(id: string, doctorId: string, params: UpdateQuoteParams): Promise<Quote>;

  /**
   * Marks the quote as sent: freezes bcvRate + totalBs, sets sentAt,
   * persists the share link, and sets status = 'sent'.
   * Throws QuoteNotFoundError when not found or not owned.
   */
  markAsSent(id: string, doctorId: string, params: SendQuoteParams): Promise<Quote>;

  /**
   * Updates status to accepted | rejected | expired.
   * Throws QuoteNotFoundError when not found or not owned.
   */
  updateStatus(id: string, doctorId: string, status: QuoteStatus): Promise<Quote>;

  /**
   * Deletes a quote and its items (cascade in DB).
   * Only draft quotes may be deleted.
   * Throws QuoteNotFoundError when not found or not owned.
   * Throws QuoteAlreadySentError when the quote is not in draft status.
   */
  delete(id: string, doctorId: string): Promise<void>;

  /** Returns all items for a quote. */
  findItemsByQuoteId(quoteId: string): Promise<QuoteItem[]>;
}
