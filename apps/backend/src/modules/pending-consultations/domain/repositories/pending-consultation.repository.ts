import type { Transaction } from 'sequelize';
import type { PendingConsultation } from '../entities/pending-consultation.entity';
import type { PendingConsultationStatus } from '@delta/shared-types';

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
}
