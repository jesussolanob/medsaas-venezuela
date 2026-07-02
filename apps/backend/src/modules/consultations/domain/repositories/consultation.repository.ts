import type { Consultation } from '../entities/consultation.entity';
import type { PaymentStatus } from '@delta/shared-types';

export const CONSULTATION_REPOSITORY = 'CONSULTATION_REPOSITORY';

export interface ConsultationListFilters {
  doctorId: string;
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: PaymentStatus;
  page: number;
  limit: number;
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
   */
  update(
    id: string,
    doctorId: string,
    fields: Partial<
      Pick<Consultation, 'chiefComplaint' | 'diagnosis' | 'treatment' | 'notes' | 'blocksSnapshot'>
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
}
