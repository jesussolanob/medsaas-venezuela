import type {
  StandaloneDocument,
  StandaloneDocumentType,
  StandaloneDocumentStatus,
} from '../entities/standalone-document.entity';

export const STANDALONE_DOCUMENT_REPOSITORY = 'STANDALONE_DOCUMENT_REPOSITORY';

// ---------------------------------------------------------------------------
// Summary type for list view (patientName is decrypted by the repo)
// ---------------------------------------------------------------------------

export interface StandaloneDocumentSummary {
  id: string;
  type: StandaloneDocumentType;
  code: string | null;
  status: StandaloneDocumentStatus;
  patientId: string;
  /** Decrypted patient full_name — never null (every patient has a name). */
  patientName: string;
  createdAt: Date;
  issuedAt: Date | null;
  voidedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Detail type for GET /:id — includes patient PII for PDF rendering
// ---------------------------------------------------------------------------

export interface StandaloneDocumentDetail {
  document: StandaloneDocument;
  patient: {
    id: string;
    /** Decrypted full name — SECURITY: never log this. */
    fullName: string;
    /** Decrypted cédula — SECURITY: never log this. */
    cedula: string | null;
    /** Age in years (may be null if birthDate is not set). */
    age: number | null;
  };
}

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------

export interface ListStandaloneDocumentsFilters {
  doctorId: string;
  patientId?: string;
  type?: StandaloneDocumentType;
  status?: StandaloneDocumentStatus;
}

// ---------------------------------------------------------------------------
// Create params
// ---------------------------------------------------------------------------

export interface CreateStandaloneDocumentParams {
  doctorId: string;
  patientId: string;
  type: StandaloneDocumentType;
  content: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// IStandaloneDocumentRepository
// ---------------------------------------------------------------------------

export interface IStandaloneDocumentRepository {
  /**
   * Lists documents for a doctor. Ordered by created_at DESC.
   * Returns summary rows (patientName already decrypted).
   */
  list(filters: ListStandaloneDocumentsFilters): Promise<StandaloneDocumentSummary[]>;

  /**
   * Finds a document by ID. Returns null when not found.
   * Anti-IDOR: caller must check canBeModifiedBy() on the returned entity.
   */
  findById(id: string): Promise<StandaloneDocument | null>;

  /**
   * Finds a document with its decrypted patient data.
   * Used for GET /:id and PDF rendering.
   * Returns null when not found.
   */
  findByIdWithPatient(id: string, doctorId: string): Promise<StandaloneDocumentDetail | null>;

  /** Creates a new draft document. Returns the persisted entity. */
  create(params: CreateStandaloneDocumentParams): Promise<StandaloneDocument>;

  /**
   * Updates the content of a draft document.
   * Caller must verify isInDraft() before calling.
   */
  updateContent(id: string, content: Record<string, unknown>): Promise<StandaloneDocument>;

  /**
   * Persists the issued state (code + issuedAt + status).
   * Translates UniqueConstraintError on (doctor_id, code) into
   * StandaloneDocumentCodeConflictError so the use case can retry.
   */
  persistIssued(id: string, code: string, issuedAt: Date): Promise<StandaloneDocument>;

  /** Persists the voided state (status + voidReason + voidedAt). */
  persistVoided(id: string, voidReason: string | null, voidedAt: Date): Promise<StandaloneDocument>;

  /** Deletes a draft document. No-op when not found. */
  delete(id: string): Promise<void>;

  /**
   * Returns the maximum sequence number for a given doctor + prefix + yearMonth.
   * Used to seed the first available sequence on issue.
   * Returns 0 when no documents exist for that month.
   */
  getMaxSequenceForMonth(doctorId: string, prefix: string, yearMonth: string): Promise<number>;
}
