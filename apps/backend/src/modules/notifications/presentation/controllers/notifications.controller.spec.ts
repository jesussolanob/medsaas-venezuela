import { Test, type TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { ListNotificationsUseCase } from '../../application/use-cases/list-notifications.use-case';
import { MarkAsReadUseCase } from '../../application/use-cases/mark-as-read.use-case';
import { MarkAllAsReadUseCase } from '../../application/use-cases/mark-all-as-read.use-case';
import { Notification } from '../../domain/entities/notification.entity';
import { NotificationNotFoundError } from '../../domain/errors/notification-not-found.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const NOTIF_ID = 'nnnnnnnn-0000-0000-0000-000000000001';
const now = new Date('2026-09-22T10:00:00Z');

const currentUser: CurrentUserPayload = {
  sub: DOCTOR_ID,
  role: 'doctor',
  email: 'doctor@dev.local',
};

function makeNotification(id: string, readAt: Date | null = null): Notification {
  return Notification.create({
    id,
    doctorId: DOCTOR_ID,
    type: 'quote_accepted',
    title: 'Presupuesto PRE-0001 aceptado',
    body: 'El presupuesto PRE-0001 fue aceptado.',
    entityType: 'quote',
    entityId: 'qqqqqqqq-0000-0000-0000-000000000001',
    readAt,
    createdAt: now,
  });
}

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let listUseCase: { execute: jest.Mock };
  let markAsReadUseCase: { execute: jest.Mock };
  let markAllAsReadUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    listUseCase = { execute: jest.fn() };
    markAsReadUseCase = { execute: jest.fn() };
    markAllAsReadUseCase = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: ListNotificationsUseCase, useValue: listUseCase },
        { provide: MarkAsReadUseCase, useValue: markAsReadUseCase },
        { provide: MarkAllAsReadUseCase, useValue: markAllAsReadUseCase },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(NotificationsController);
  });

  describe('GET /api/doctor/notifications', () => {
    it('returns items and unreadCount', async () => {
      const items = [makeNotification(NOTIF_ID)];
      listUseCase.execute.mockResolvedValue({ items, unreadCount: 1 });

      const response = await controller.list(currentUser);

      expect(response.success).toBe(true);
      expect(response.data.unreadCount).toBe(1);
      expect(response.data.items).toHaveLength(1);
      const first = response.data.items[0];
      expect(first?.id).toBe(NOTIF_ID);
      expect(first?.readAt).toBeNull();
    });

    it('serializes readAt to ISO string when present', async () => {
      const items = [makeNotification(NOTIF_ID, now)];
      listUseCase.execute.mockResolvedValue({ items, unreadCount: 0 });

      const response = await controller.list(currentUser);

      expect(response.data.items[0]?.readAt).toBe(now.toISOString());
    });

    it('passes doctorId from the authenticated user (not body)', async () => {
      listUseCase.execute.mockResolvedValue({ items: [], unreadCount: 0 });

      await controller.list(currentUser);

      expect(listUseCase.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });
  });

  describe('POST /api/doctor/notifications/:id/read', () => {
    it('returns the notification id and readAt', async () => {
      markAsReadUseCase.execute.mockResolvedValue({ id: NOTIF_ID, readAt: now });

      const response = await controller.markOneAsRead(NOTIF_ID, currentUser);

      expect(response.success).toBe(true);
      expect(response.data.id).toBe(NOTIF_ID);
      expect(response.data.readAt).toBe(now.toISOString());
    });

    it('passes doctorId from the authenticated user (anti-IDOR)', async () => {
      markAsReadUseCase.execute.mockResolvedValue({ id: NOTIF_ID, readAt: now });

      await controller.markOneAsRead(NOTIF_ID, currentUser);

      expect(markAsReadUseCase.execute).toHaveBeenCalledWith(NOTIF_ID, DOCTOR_ID);
    });

    it('propagates NotificationNotFoundError', async () => {
      markAsReadUseCase.execute.mockRejectedValue(new NotificationNotFoundError());

      await expect(controller.markOneAsRead(NOTIF_ID, currentUser)).rejects.toThrow(
        NotificationNotFoundError,
      );
    });
  });

  describe('POST /api/doctor/notifications/read-all', () => {
    it('returns the count of updated notifications', async () => {
      markAllAsReadUseCase.execute.mockResolvedValue({ count: 3 });

      const response = await controller.markAllAsReadHandler(currentUser);

      expect(response.success).toBe(true);
      expect(response.data.count).toBe(3);
    });

    it('passes doctorId from the authenticated user (anti-IDOR)', async () => {
      markAllAsReadUseCase.execute.mockResolvedValue({ count: 0 });

      await controller.markAllAsReadHandler(currentUser);

      expect(markAllAsReadUseCase.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('returns { count: 0 } when all are already read (idempotent)', async () => {
      markAllAsReadUseCase.execute.mockResolvedValue({ count: 0 });

      const response = await controller.markAllAsReadHandler(currentUser);

      expect(response.data.count).toBe(0);
    });
  });
});
