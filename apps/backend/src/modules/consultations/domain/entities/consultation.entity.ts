import type { PaymentStatus } from '@delta/shared-types';
import type { ConsultationExtraItem } from './consultation-extra-item.entity';

/**
 * A single block definition as stored in blocks_structure.
 *
 * Opaque, frontend-managed metadata persisted verbatim as JSONB. Items arrive with
 * inconsistent field naming (camelCase from the doctor's resolved config, snake_case
 * from the add-block catalog), so only `key` is guaranteed. The backend does not
 * interpret the remaining fields — it stores and returns them untouched — hence the
 * index signature instead of a fixed shape. Values for each block live in blocksSnapshot
 * (key→value record).
 */
export interface BlockDefinition {
  key: string;
  [field: string]: unknown;
}

export interface ConsultationCreateParams {
  id: string;
  doctorId: string;
  patientId: string;
  appointmentId?: string | null;
  consultationCode: string;
  consultationDate: Date;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
  paymentStatus: PaymentStatus;
  paymentMethod?: string | null;
  amount?: number | null;
  /**
   * The stable base price of the consultation (set once on first approval).
   * `total = base_amount + Σ(extra_items.amount_usd)`.
   * Null until the payment has been approved at least once.
   */
  baseAmount?: number | null;
  paymentDate?: Date | null;
  paymentReference?: string | null;
  paymentReceiptUrl?: string | null;
  blocksSnapshot?: Record<string, unknown> | null;
  /**
   * Per-consultation block structure definitions (array).
   * Stored separately from blocksSnapshot (which holds values).
   * Null until the doctor first saves a structured template for this consultation.
   */
  blocksStructure?: BlockDefinition[] | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Enrichment fields — populated by the list/findById queries via JOIN.
   * Null when the consultation was constructed without JOIN enrichment
   * (e.g. after create/update operations).
   * Not a domain invariant; purely for read-side presentation.
   */
  patientName?: string | null;
  appointmentStatus?: string | null;
  /**
   * Extra service items linked to this consultation.
   * Populated by findById (not by list queries — too expensive).
   * Empty array when there are no extras or when not loaded.
   */
  extraItems?: ConsultationExtraItem[];
}

/**
 * Consultation domain entity.
 *
 * Holds decrypted (plaintext) clinical data in memory — encryption/decryption is
 * the responsibility of the infrastructure layer (SequelizeConsultationRepository).
 *
 * Business invariants enforced here:
 *   - canBeModifiedBy() enforces doctor ownership (anti-IDOR).
 *   - canApprovePayment() prevents double-approval transitions.
 */
export class Consultation {
  readonly id: string;
  readonly doctorId: string;
  readonly patientId: string;
  readonly appointmentId: string | null;
  readonly consultationCode: string;
  readonly consultationDate: Date;
  readonly chiefComplaint: string | null;
  readonly diagnosis: string | null;
  readonly treatment: string | null;
  readonly notes: string | null;
  readonly paymentStatus: PaymentStatus;
  readonly paymentMethod: string | null;
  readonly amount: number | null;
  /** Stable base price set on first approval. Total = baseAmount + Σ extraItems. */
  readonly baseAmount: number | null;
  readonly paymentDate: Date | null;
  readonly paymentReference: string | null;
  readonly paymentReceiptUrl: string | null;
  readonly blocksSnapshot: Record<string, unknown> | null;
  /** Per-consultation block structure definitions — separate from blocksSnapshot values. */
  readonly blocksStructure: BlockDefinition[] | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Decrypted patient full name — populated by the enriched list/findById query. */
  readonly patientName: string | null;
  /** Status of the linked appointment — populated by the enriched list/findById query. */
  readonly appointmentStatus: string | null;
  /** Extra service items — populated by findById. Empty array when not loaded. */
  readonly extraItems: ConsultationExtraItem[];

  constructor(params: ConsultationCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.patientId = params.patientId;
    this.appointmentId = params.appointmentId ?? null;
    this.consultationCode = params.consultationCode;
    this.consultationDate = params.consultationDate;
    this.chiefComplaint = params.chiefComplaint ?? null;
    this.diagnosis = params.diagnosis ?? null;
    this.treatment = params.treatment ?? null;
    this.notes = params.notes ?? null;
    this.paymentStatus = params.paymentStatus;
    this.paymentMethod = params.paymentMethod ?? null;
    this.amount = params.amount ?? null;
    this.baseAmount = params.baseAmount ?? null;
    this.paymentDate = params.paymentDate ?? null;
    this.paymentReference = params.paymentReference ?? null;
    this.paymentReceiptUrl = params.paymentReceiptUrl ?? null;
    this.blocksSnapshot = params.blocksSnapshot ?? null;
    this.blocksStructure = params.blocksStructure ?? null;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
    this.patientName = params.patientName ?? null;
    this.appointmentStatus = params.appointmentStatus ?? null;
    this.extraItems = params.extraItems ?? [];
  }

  /**
   * Returns true when the given doctor owns this consultation.
   * Used to enforce anti-IDOR on all read and write operations.
   */
  canBeModifiedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Returns true when the payment transition pending → approved is allowed.
   * A second approval attempt must throw PaymentAlreadyApprovedError.
   */
  canApprovePayment(): boolean {
    return this.paymentStatus === 'pending';
  }

  /** Factory — creates a Consultation from raw (plaintext) data. Does not persist. */
  static create(params: ConsultationCreateParams): Consultation {
    return new Consultation(params);
  }
}
