import { Inject, Injectable } from '@nestjs/common';
import type { Notification } from '../../domain/entities/notification.entity';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../domain/repositories/inotification.repository';

const DEFAULT_LIMIT = 30;

export interface ListNotificationsResult {
  items: Notification[];
  unreadCount: number;
}

/**
 * Returns the most recent notifications for a doctor together with the total
 * count of unread notifications.
 *
 * Both queries run concurrently (Promise.all) to minimize round-trip time.
 */
@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
  ) {}

  async execute(doctorId: string): Promise<ListNotificationsResult> {
    const [items, unreadCount] = await Promise.all([
      this.notificationRepo.listForDoctor(doctorId, DEFAULT_LIMIT),
      this.notificationRepo.countUnreadForDoctor(doctorId),
    ]);

    return { items, unreadCount };
  }
}
