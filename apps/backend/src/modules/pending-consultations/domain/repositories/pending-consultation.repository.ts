import type { Transaction } from 'sequelize';
import type { PendingConsultation } from '../entities/pending-consultation.entity';
import type { PendingConsultationStatus } from '@delta/shared-types';

/**
 * Per-plan session usage for a patient.
 *
 * Sesión consumida = ATENDIDA. Una inasistencia (no_show) NO consume sesión;
 * va en su propio balde para que el especialista vea la verdad y decida.
 * Las citas canceladas no cuentan en ningún balde.
 *
 * Agrupado por plan_name (no por payment_id) porque payment_id puede ser null
 * cuando el especialista carga el paquete a mano. Consecuencia aceptada: si el
 * paciente compró el mismo combo dos veces, los contadores se suman en una fila.
 */
export interface PackageUsageRow {
  /** UUID del paciente. Incluido siempre para que el frontend pueda indexar en modo masivo. */
  patientId: string;
  planName: string;
  /**
   * pricing_plans.sessions_count para ese plan_name + doctor.
   * null cuando el servicio fue eliminado del catálogo.
   */
  totalSessions: number | null;
  /** Citas con status = 'completed'. */
  attended: number;
  /** Citas con status IN ('scheduled', 'confirmed'). */
  scheduled: number;
  /** Citas con status = 'no_show'. No consumen sesión. */
  noShow: number;
  /** Filas en pending_consultations con status = 'pending_scheduling'. */
  pendingScheduling: number;
}

export const PENDING_CONSULTATION_REPOSITORY = Symbol('IPendingConsultationRepository');

export interface PendingConsultationListFilters {
  doctorId: string;
  status?: PendingConsultationStatus;
}

export interface PendingConsultationBulkCreateItem {
  doctorId: string;
  patientId: string;
  authUserId?: string | null;
  packageId?: string | null;
  paymentId?: string | null;
  planName: string;
  officeId?: string | null;
  appointmentMode?: string | null;
  sessionNumber: number;
  expiresAt?: Date | null;
}

export interface IPendingConsultationRepository {
  /**
   * Find a single pending consultation by ID scoped to the owning doctor.
   * Returns null when not found or when the doctor does not own it (anti-IDOR).
   */
  findByIdAndDoctor(id: string, doctorId: string): Promise<PendingConsultation | null>;

  /**
   * Find a single pending consultation by ID without scope restriction.
   * Used internally by token-based flows where the doctor ID is not known upfront.
   */
  findById(id: string): Promise<PendingConsultation | null>;

  /**
   * List all pending consultations for a doctor with optional status filter.
   */
  findByDoctor(filters: PendingConsultationListFilters): Promise<PendingConsultation[]>;

  /**
   * Find pending consultations that have exceeded their expiry and are still
   * in 'pending_scheduling' status. Used by the expiry cron job.
   * @param limit Safety cap to bound the cron job impact (default 500).
   */
  findExpired(limit?: number): Promise<PendingConsultation[]>;

  /**
   * Bulk-create multiple pending consultations in a single transaction.
   * Returns the created domain entities.
   */
  bulkCreate(
    items: PendingConsultationBulkCreateItem[],
    transaction?: Transaction,
  ): Promise<PendingConsultation[]>;

  /**
   * Persist an updated pending consultation (status, scheduled_appointment_id, etc.).
   * Returns the updated domain entity.
   */
  save(entity: PendingConsultation, transaction?: Transaction): Promise<PendingConsultation>;

  /**
   * Bulk-expire: set status='expired' for rows matching the given IDs.
   * Used by the expiry cron job for batched updates.
   */
  bulkExpire(ids: string[]): Promise<void>;

  /**
   * Find pending consultations eligible for a reminder dispatch.
   * Criteria:
   *   - status = 'pending_scheduling'
   *   - not expired (expires_at IS NULL OR expires_at > now)
   * Ordered by created_at ASC so oldest sessions get reminded first.
   * @param limit Safety cap per cron run (default 200).
   */
  findDueForReminder(limit?: number): Promise<PendingConsultation[]>;

  /**
   * Atomically update the reminder stage and last_reminder_at timestamp
   * for a single pending consultation.
   * No-op when the row no longer exists or has a non-matching status
   * (prevents clobbering a row that was concurrently scheduled/cancelled).
   */
  updateReminderStage(id: string, stage: number, lastReminderAt: Date): Promise<void>;

  /**
   * Compute session usage for a patient grouped by plan_name.
   *
   * Combines appointments (attended / scheduled / no_show) and
   * pending_consultations (pending_scheduling) in one round-trip.
   *
   * Only plans with sessions_count > 1 OR at least one pending_scheduling
   * row are returned — single-session "consultas sueltas" are excluded so
   * the UI only shows real package progress.
   *
   * When `patientId` is provided, filters to that single patient.
   * When omitted, returns all patients of the doctor in one query — callers
   * MUST NOT call this in a loop per patient (N+1).
   *
   * Anti-IDOR: the caller (use case) must verify patient ownership before
   * invoking — this method does NOT re-check ownership.
   *
   * NEVER log patientId or planName (PII).
   */
  getPackageUsage(doctorId: string, patientId?: string): Promise<PackageUsageRow[]>;
}
