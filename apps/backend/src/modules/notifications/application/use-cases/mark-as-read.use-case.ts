import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../domain/repositories/inotification.repository';
import { NotificationNotFoundError } from '../../domain/errors/notification-not-found.error';

export interface MarkAsReadResult {
  id: string;
  readAt: Date;
}

/**
 * Marks a single notification as read for the authenticated doctor.
 *
 * Anti-IDOR: doctorId MUST come from the authenticated user, never from the
 * request body. The repository enforces that the notification belongs to the
 * doctor and returns false (not found / not owned / already read) or true
 * (updated). False produces a 404 so callers cannot distinguish ownership
 * from existence.
 *
 * Idempotency: the repository only updates rows where read_at IS NULL.
 * Calling this on an already-read notification returns false → 404.
 * Clients that need to confirm a read without caring about idempotency should
 * use MarkAllAsReadUseCase instead, which is fully idempotent.
 */
@Injectable()
export class MarkAsReadUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
  ) {}

  async execute(id: string, doctorId: string): Promise<MarkAsReadResult> {
    const readAt = new Date();
    const updated = await this.notificationRepo.markAsRead(id, doctorId, readAt);

    if (!updated) {
      throw new NotificationNotFoundError();
    }

    return { id, readAt };
  }
}
