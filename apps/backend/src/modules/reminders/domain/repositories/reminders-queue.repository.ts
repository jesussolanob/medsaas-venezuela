import type { ReminderQueueItem } from '../entities/reminder-queue-item.entity';

export const REMINDERS_QUEUE_REPOSITORY = 'REMINDERS_QUEUE_REPOSITORY';

/** A slim projection of appointment data used by the email dispatch use case. */
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
 * A slim projection of appointment data used by the WhatsApp dispatch use case.
 * Includes patient_phone (plaintext snapshot stored on appointments) and
 * consultation payment status for template selection.
 */
export interface AppointmentDueRowWhatsApp {
  appointmentId: string;
  doctorId: string;
  patientId: string | null;
  /** Plaintext phone snapshot stored on the appointment row. */
  patientPhone: string | null;
  patientName: string | null;
  scheduledAt: Date;
  appointmentMode: string;
  /** Name of the linked office, or null for online/legacy appointments. */
  officeName: string | null;
  /** Payment status of the linked consultation, or null when no consultation exists. */
  consultationPaymentStatus: string | null;
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
  /** Zernio messageId — recorded after a successful WhatsApp send. */
  externalMessageId?: string | null;
  /** Zernio conversationId — recorded after a successful WhatsApp send. */
  externalConversationId?: string | null;
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
   * Finds appointments due for an EMAIL reminder within the given time window.
   *
   * Applies LEFT JOIN to reminders_settings (defaults if no row exists) and
   * NOT EXISTS to reminders_queue for channel='email' (idempotency).
   *
   * @param offsetType  '24h' | '1h' — determines the settings column to check.
   * @param windowStart Lower bound (inclusive) of scheduled_at window.
   * @param windowEnd   Upper bound (inclusive) of scheduled_at window.
   * @param statuses    Appointment statuses to include.
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
   * Finds appointments due for a WHATSAPP reminder within the given time window.
   *
   * Filters by channel IN ('whatsapp','both'), checks reminder_Xh_enabled,
   * and excludes appointments already queued with channel='whatsapp' for this
   * offsetType (idempotency via NOT EXISTS).
   *
   * Returns appointments with phone, office name, and consultation payment status.
   *
   * @param offsetType  '24h' | '3h' — determines the settings column to check.
   * @param windowStart Lower bound (inclusive) of scheduled_at window.
   * @param windowEnd   Upper bound (inclusive) of scheduled_at window.
   * @param statuses    Appointment statuses to include.
   * @param cap         Maximum rows to return per run.
   */
  findDueForWhatsAppReminder(
    offsetType: string,
    windowStart: Date,
    windowEnd: Date,
    statuses: string[],
    cap: number,
  ): Promise<AppointmentDueRowWhatsApp[]>;

  /**
   * Counts distinct patient_id values in sent WhatsApp queue rows in the
   * rolling 24-hour window. Used to enforce the daily Meta Tier 250 cap.
   */
  countWhatsAppUniqueRecipientsLast24h(): Promise<number>;

  /**
   * Inserts a new pending queue row.
   * If the UNIQUE(appointment_id, offset_type, channel) constraint fires,
   * the insert is silently skipped (ON CONFLICT DO NOTHING) and null is returned.
   *
   * Returns the inserted row id or null when the constraint blocked the insert.
   */
  insertPending(input: InsertQueueRowInput): Promise<string | null>;

  /**
   * Updates the external_message_id and external_conversation_id on a queue row
   * after a successful WhatsApp send. Called immediately after insertPending when
   * the WhatsApp message is dispatched successfully.
   */
  updateExternalIds(
    rowId: string,
    externalMessageId: string,
    externalConversationId: string,
  ): Promise<void>;

  /**
   * Marks a queue row as sent.
   */
  markSent(rowId: string): Promise<void>;

  /**
   * Marks a queue row as failed, recording the error detail and incrementing attempts.
   */
  markFailed(rowId: string, errorMessage: string): Promise<void>;
}
