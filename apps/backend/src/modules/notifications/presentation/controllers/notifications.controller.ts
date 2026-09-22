import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ListNotificationsUseCase } from '../../application/use-cases/list-notifications.use-case';
import { MarkAsReadUseCase } from '../../application/use-cases/mark-as-read.use-case';
import { MarkAllAsReadUseCase } from '../../application/use-cases/mark-all-as-read.use-case';
import type { Notification } from '../../domain/entities/notification.entity';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface SuccessResponse<T> {
  success: true;
  data: T;
}

function toItem(n: Notification): NotificationItem {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * NotificationsController — in-app bell for doctors.
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 * All endpoints require AppAuthGuard.
 *
 * SECURITY:
 *   - doctorId is ALWAYS taken from the authenticated user (user.sub).
 *   - Never trust doctor_id from the request body or URL — anti-IDOR.
 *   - Notification IDs in :id are validated as UUID to prevent injection.
 *
 * ROUTES:
 *   GET  /api/doctor/notifications         — list + unread count
 *   POST /api/doctor/notifications/:id/read — mark one as read
 *   POST /api/doctor/notifications/read-all — mark all as read
 *
 * Note: mark-read uses POST (not PATCH) so it can be safely proxied through
 * Next.js route handlers without method restrictions (ADR-022).
 */
@Controller('doctor/notifications')
@UseGuards(AppAuthGuard)
export class NotificationsController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly markAsRead: MarkAsReadUseCase,
    private readonly markAllAsRead: MarkAllAsReadUseCase,
  ) {}

  /**
   * GET /api/doctor/notifications
   *
   * Returns the 30 most recent notifications plus the total unread count.
   */
  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ items: NotificationItem[]; unreadCount: number }>> {
    const result = await this.listNotifications.execute(user.sub);
    return {
      success: true,
      data: {
        items: result.items.map(toItem),
        unreadCount: result.unreadCount,
      },
    };
  }

  /**
   * POST /api/doctor/notifications/:id/read
   *
   * Marks the given notification as read.
   * Returns 404 when the notification does not exist or belongs to another doctor.
   */
  @Post(':id/read')
  @HttpCode(200)
  async markOneAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ id: string; readAt: string }>> {
    const result = await this.markAsRead.execute(id, user.sub);
    return {
      success: true,
      data: { id: result.id, readAt: result.readAt.toISOString() },
    };
  }

  /**
   * POST /api/doctor/notifications/read-all
   *
   * Marks all unread notifications as read for the authenticated doctor.
   * Idempotent: returns { count: 0 } if nothing was unread.
   */
  @Post('read-all')
  @HttpCode(200)
  async markAllAsReadHandler(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ count: number }>> {
    const result = await this.markAllAsRead.execute(user.sub);
    return { success: true, data: { count: result.count } };
  }
}
