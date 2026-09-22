import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  Notification,
  type NotificationEntityType,
  type NotificationType,
} from '../../domain/entities/notification.entity';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../domain/repositories/inotification.repository';

export interface CreateNotificationInput {
  doctorId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
}

/**
 * Creates a new in-app notification for a doctor.
 *
 * Exported from NotificationsModule so other modules (e.g. QuotesModule) can
 * inject it as a best-effort side effect. Callers MUST wrap calls in
 * try/catch — a notification failure must never break a business operation.
 */
@Injectable()
export class CreateNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
  ) {}

  async execute(input: CreateNotificationInput): Promise<Notification> {
    const notification = Notification.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      type: input.type,
      title: input.title,
      body: input.body,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      readAt: null,
      createdAt: new Date(),
    });

    return this.notificationRepo.create(notification);
  }
}
