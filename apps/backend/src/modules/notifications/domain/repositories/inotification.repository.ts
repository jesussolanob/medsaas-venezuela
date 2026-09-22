import type { Notification } from '../entities/notification.entity';

export const NOTIFICATION_REPOSITORY = 'NOTIFICATION_REPOSITORY';

/**
 * Contract for notification persistence.
 *
 * The application layer depends only on this interface, never on the Sequelize
 * implementation, keeping the domain layer infrastructure-free.
 */
export interface INotificationRepository {
  /**
   * Persists a new notification.
   * Returns the saved entity.
   */
  create(notification: Notification): Promise<Notification>;

  /**
   * Returns the most recent notifications for a doctor.
   * Sorted by created_at DESC.
   * @param limit Maximum number of records to return (default: 30).
   */
  listForDoctor(doctorId: string, limit?: number): Promise<Notification[]>;

  /** Returns the count of unread notifications for a doctor. */
  countUnreadForDoctor(doctorId: string): Promise<number>;

  /**
   * Finds a single notification by ID, scoped to the given doctor.
   * Returns null when the notification does not exist OR belongs to a different
   * doctor — never distinguish the two (anti-IDOR).
   */
  findByIdForDoctor(id: string, doctorId: string): Promise<Notification | null>;

  /**
   * Stamps read_at on a single notification, scoped to the given doctor.
   * Returns true when a row was updated, false when the notification did not
   * exist, was already read, or belonged to another doctor.
   */
  markAsRead(id: string, doctorId: string, readAt: Date): Promise<boolean>;

  /**
   * Stamps read_at on all unread notifications for the given doctor.
   * Returns the count of notifications that were updated.
   */
  markAllAsRead(doctorId: string, readAt: Date): Promise<number>;
}
