import type { ReminderQueueItem } from '../entities/reminder-queue-item.entity';

export const REMINDERS_QUEUE_REPOSITORY = 'REMINDERS_QUEUE_REPOSITORY';

/** A slim projection of appointment data used by the dispatch use case. */
export interface AppointmentDueRow {
  appointmentId: string;
  doctorId: string;
  patientId: string | null;
  patientEmail: string;
  patientName: string | null;
  scheduledAt: Date;
  appointmentMode: string;
}

/**
 * Input payload for inserting a pending queue row.
 * All send-attempt metadata (attempts, sentAt, errorMessage) defaults
 * at the DB/model level — callers only provide these scheduling fields.
 */
export interface InsertQueueRowInput {
  appointmentId: string;
  doctorId: string;
  patientId: string | null;
  offsetType: string;
  scheduledFor: Date;
  channel: string;
}

/**
 * Contract for ReminderQueue persistence.
 */
export interface IRemindersQueueRepository {
  /**
   * Returns queue items for a given doctorId, ordered by scheduled_for ASC.
   * Returns [] when no items exist.
   */
  listByDoctorId(doctorId: string): Promise<ReminderQueueItem[]>;

  /**
   * Returns ALL queue items across all doctors, ordered by scheduled_for ASC.
   * Limited to 50 rows for the admin monitor endpoint.
   */
  listAll(limit: number): Promise<ReminderQueueItem[]>;

  /**
   * Finds appointments due for a reminder within the given time window.
   *
   * Applies LEFT JOIN to reminders_settings (defaults if no row exists) and
   * NOT EXISTS to reminders_queue (idempotency — skip already-queued rows).
   *
   * @param offsetType  '24h' | '1h' — determines the settings column to check.
   * @param windowStart Lower bound (inclusive) of scheduled_at window.
   * @param windowEnd   Upper bound (inclusive) of scheduled_at window.
   * @param statuses    Appointment statuses to include (e.g. ['scheduled'] for 24h,
   *                    ['scheduled','confirmed'] for 1h).
   * @param cap         Maximum rows to return per run.
   */
  findDueForReminder(
    offsetType: string,
    windowStart: Date,
    windowEnd: Date,
    statuses: string[],
    cap: number,
  ): Promise<AppointmentDueRow[]>;

  /**
   * Inserts a new pending queue row.
   * If the UNIQUE(appointment_id, offset_type) constraint fires, the insert is
   * silently skipped (ON CONFLICT DO NOTHING) and null is returned.
   *
   * Returns the inserted row id or null when the constraint blocked the insert.
   */
  insertPending(input: InsertQueueRowInput): Promise<string | null>;

  /**
   * Marks a queue row as sent.
   */
  markSent(rowId: string): Promise<void>;

  /**
   * Marks a queue row as failed, recording the error detail and incrementing attempts.
   */
  markFailed(rowId: string, errorMessage: string): Promise<void>;
}
