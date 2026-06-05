import type { ReminderQueueItem } from '../entities/reminder-queue-item.entity';

export const REMINDERS_QUEUE_REPOSITORY = 'REMINDERS_QUEUE_REPOSITORY';

/**
 * Contract for ReminderQueue persistence.
 *
 * In Etapa 1 the queue is populated externally (Fase 6). This interface
 * exposes only the read operations needed for monitoring endpoints.
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
}
