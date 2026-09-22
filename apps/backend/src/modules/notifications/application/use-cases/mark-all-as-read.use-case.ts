import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../domain/repositories/inotification.repository';

export interface MarkAllAsReadResult {
  count: number;
}

/**
 * Marks all unread notifications as read for the authenticated doctor.
 *
 * Fully idempotent: calling this when there are no unread notifications
 * returns { count: 0 } — no error.
 *
 * Anti-IDOR: doctorId MUST come from the authenticated user, never from the
 * request body or URL.
 */
@Injectable()
export class MarkAllAsReadUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
  ) {}

  async execute(doctorId: string): Promise<MarkAllAsReadResult> {
    const count = await this.notificationRepo.markAllAsRead(doctorId, new Date());
    return { count };
  }
}
