/**
 * Notification domain entity.
 *
 * Represents an in-app bell notification for a doctor.
 * MVP scope: quote_accepted | quote_rejected events only.
 *
 * Invariants:
 *   - isRead() reflects whether read_at has been set.
 *   - markRead() returns a new Notification (immutable) with read_at stamped.
 *   - isOwnedBy() enforces anti-IDOR: the application layer must call this
 *     before exposing or mutating a notification.
 *
 * No imports from NestJS, Sequelize, or any external library.
 */

export type NotificationType = 'quote_accepted' | 'quote_rejected';
export type NotificationEntityType = 'quote';

export interface NotificationParams {
  id: string;
  doctorId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: NotificationEntityType | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export class Notification {
  readonly id: string;
  readonly doctorId: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly entityType: NotificationEntityType | null;
  readonly entityId: string | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;

  constructor(params: NotificationParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.type = params.type;
    this.title = params.title;
    this.body = params.body;
    this.entityType = params.entityType ?? null;
    this.entityId = params.entityId ?? null;
    this.readAt = params.readAt ?? null;
    this.createdAt = params.createdAt;
  }

  /** True when the notification has been read. */
  get isRead(): boolean {
    return this.readAt !== null;
  }

  /** Returns true when the given doctorId is the owner. Anti-IDOR guard. */
  isOwnedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Returns a new Notification with read_at stamped (immutable).
   * Idempotent: calling markRead on an already-read notification is a no-op
   * (preserves the original read_at).
   */
  markRead(at: Date): Notification {
    if (this.isRead) return this;
    return Notification.create({ ...this.toParams(), readAt: at });
  }

  /** Factory — constructs a Notification from raw params. Does not persist. */
  static create(params: NotificationParams): Notification {
    return new Notification(params);
  }

  private toParams(): NotificationParams {
    return {
      id: this.id,
      doctorId: this.doctorId,
      type: this.type,
      title: this.title,
      body: this.body,
      entityType: this.entityType,
      entityId: this.entityId,
      readAt: this.readAt,
      createdAt: this.createdAt,
    };
  }
}
