import type { Consultation } from '../entities/consultation.entity';
import type { ConsultationExtraItem } from '../entities/consultation-extra-item.entity';
import type { PaymentStatus } from '@delta/shared-types';

/**
 * Lightweight billing projection returned by listWithAppointment().
 * Contains the effective amount and appointment enrichment fields needed
 * for the with-patient billing endpoint.
 * Not a full Consultation entity — no clinical PHI is included.
 */
export interface ConsultationWithAppointmentRow {
  id: string;
  consultationCode: string;
  consultationDate: Date;
  patientId: string;
  paymentStatus: PaymentStatus;
  /** COALESCE(c.amount, a.plan_price, 0) — never null. */
  amountUsd: number;
  /** scheduled_at from the linked appointments row; null when no appointment. */
  scheduledAt: Date | null;
  /** appointment_mode from appointments; null when no appointment. */
  appointmentMode: string | null;
  /** duration_minutes from appointments; null when no appointment or not set. */
  durationMinutes: number | null;
}

export const CONSULTATION_REPOSITORY = 'CONSULTATION_REPOSITORY';

export type ConsultationSortField =
  | 'consultation_date'
  | 'created_at'
  | 'consultation_status'
  | 'confirmation_status';

export interface ConsultationListFilters {
  doctorId: string;
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: PaymentStatus;
  page: number;
  limit: number;
  /** Server-side sort column. Defaults to 'consultation_date' when absent or invalid. */
  sort?: ConsultationSortField;
}

export interface ConsultationListResult {
  items: Consultation[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Contract for consultation persistence.
 *
 * The application layer depends only on this interface — never on the
 * Sequelize implementation — to keep the domain layer infrastructure-free.
 */
export interface IConsultationRepository {
  /** Find one by ID scoped to doctorId (returns null for foreign/missing IDs). */
  findById(id: string, doctorId: string): Promise<Consultation | null>;

  /** Find one by exact consultation_code (for uniqueness checks). */
  findByCode(code: string): Promise<Consultation | null>;

  /**
   * Returns the count of consultations for the given doctorId in the given YYYYMM period.
   * Used to derive the next sequence number for code generation.
   */
  countByDoctorAndMonth(doctorId: string, yearMonth: string): Promise<number>;

  /**
   * Returns the highest sequence number (NNNN) currently used in any
   * `DLT-YYYYMM-NNNN` code for the given month, across ALL doctors — the
   * consultation_code UNIQUE constraint is global. Returns 0 when none exist.
   *
   * Seeding the next sequence from this max (instead of a per-doctor count)
   * makes code generation collision-free even when the month already has codes
   * with gaps (the count-based seed could land on an existing code and, with
   * dense ranges, exhaust the retry budget → consultation silently not created).
   */
  getMaxSequenceForMonth(yearMonth: string): Promise<number>;

  /**
   * Persist a new consultation.
   *
   * Throws ConsultationCodeConflictError if the consultation_code already exists
   * (UNIQUE constraint violation). The use case catches this and retries with the
   * next sequence number to handle concurrent inserts correctly.
   */
  save(consultation: Consultation): Promise<Consultation>;

  /**
   * Partial update scoped to (id, doctorId).
   * Only the provided fields are written; others remain unchanged.
   *
   * blocksSnapshot semantics:
   *   - undefined  → field not touched (omitted from the UPDATE)
   *   - null       → field cleared (written as NULL)
   *   - object     → field replaced with the new value
   *
   * blocksStructure semantics (same pattern):
   *   - undefined  → field not touched (omitted from the UPDATE)
   *   - null       → field cleared (written as NULL)
   *   - array      → field replaced with the new structure
   */
  update(
    id: string,
    doctorId: string,
    fields: Partial<
      Pick<
        Consultation,
        | 'chiefComplaint'
        | 'diagnosis'
        | 'treatment'
        | 'notes'
        | 'blocksSnapshot'
        | 'blocksStructure'
      >
    >,
  ): Promise<Consultation>;

  /**
   * Updates payment fields (status, method, date, amount).
   * Scoped to (id, doctorId).
   */
  updatePayment(
    id: string,
    doctorId: string,
    fields: {
      paymentStatus: PaymentStatus;
      paymentMethod?: string | null;
      paymentDate?: Date | null;
      amount?: number | null;
    },
  ): Promise<Consultation>;

  /**
   * Partial update of payment detail fields: status, method, reference, receiptUrl, amount.
   * Scoped to (id, doctorId). No PaymentAlreadyApproved guard — details are always editable.
   *
   * Undefined semantics:
   *   - undefined → field not touched (omitted from the UPDATE)
   *   - null      → field cleared (written as NULL in the DB)
   *   - value     → field replaced with the provided value
   *
   * paymentDate auto-set: if paymentStatus is set to 'approved' and paymentDate is
   * undefined, the implementation sets paymentDate to new Date() automatically.
   */
  updatePaymentDetails(
    id: string,
    doctorId: string,
    patch: {
      paymentStatus?: PaymentStatus;
      paymentMethod?: string | null;
      paymentReference?: string | null;
      paymentReceiptUrl?: string | null;
      amount?: number | null;
    },
  ): Promise<Consultation>;

  /** Paginated list filtered by doctorId and optional date/payment_status filters. */
  list(filters: ConsultationListFilters): Promise<ConsultationListResult>;

  /**
   * Returns all consultations for a given patient, scoped to doctorId.
   * Sorted chronologically DESC (most recent first).
   */
  findByPatient(
    patientId: string,
    doctorId: string,
    page: number,
    limit: number,
  ): Promise<ConsultationListResult>;

  /**
   * Finds a consultation by its appointment_id, scoped to doctorId (anti-IDOR).
   * Returns null when no consultation is linked to that appointment.
   */
  findByAppointmentId(appointmentId: string, doctorId: string): Promise<Consultation | null>;

  /**
   * Hard-deletes a consultation by primary key.
   * Used by DeleteAppointmentUseCase to cascade-delete the linked consultation
   * before removing the parent appointment row.
   */
  deleteById(id: string): Promise<void>;

  /**
   * Billing read: returns consultations for the doctor enriched with appointment
   * fields (scheduled_at, appointment_mode, duration_minutes) and the effective
   * amount resolved via COALESCE(c.amount, a.plan_price, 0).
   *
   * Used exclusively by ListConsultationsWithPatientUseCase.
   * Results are sorted by consultation_date DESC.
   * SECURITY: scoped to doctorId (anti-IDOR).
   */
  listWithAppointment(filters: {
    doctorId: string;
    limit: number;
  }): Promise<ConsultationWithAppointmentRow[]>;

  /**
   * Atomically approves a consultation payment with extra service items.
   *
   * Within a single DB transaction:
   *   1. If `baseAmount` is null on the consultation (first approval), sets
   *      `base_amount = COALESCE(current_amount, appointment.plan_price, 0)`.
   *   2. Deletes all existing `consultation_extra_items` for this consultationId.
   *   3. Inserts the provided extras (empty array = no extras).
   *   4. Computes `total = base_amount + Σ(extras.amount_usd)`.
   *   5. Updates `consultations.amount = total`, `payment_status = 'approved'`,
   *      `payment_method`, and `payment_date = NOW()`.
   *   6. Returns the updated Consultation with `extraItems` populated.
   *
   * Anti-double-count guarantee:
   *   `base_amount` is written only once (on first approval) and is derived from
   *   the consultation's amount BEFORE any extras are added. On re-approval the
   *   stored `base_amount` is used directly — the extras sum is NOT re-accumulated
   *   on top of a total that already includes a previous extras sum.
   *
   * Scoped to (id, doctorId) — returns null if not found or not owned.
   */
  approveWithExtras(
    id: string,
    doctorId: string,
    extras: Array<{ description: string; amountUsd: number }>,
    paymentMethod?: string | null,
  ): Promise<Consultation>;

  /**
   * Loads extra items for a given consultation, scoped to doctorId.
   * Returns an empty array when there are no extras or when the consultation
   * does not belong to the doctor.
   */
  findExtraItems(consultationId: string, doctorId: string): Promise<ConsultationExtraItem[]>;
}
