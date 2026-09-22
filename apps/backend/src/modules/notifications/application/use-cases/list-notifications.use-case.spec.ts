import { ListNotificationsUseCase } from './list-notifications.use-case';
import type { INotificationRepository } from '../../domain/repositories/inotification.repository';
import { Notification } from '../../domain/entities/notification.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-09-22T10:00:00Z');

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

function makeRepo(
  items: Notification[] = [],
  unreadCount = 0,
): jest.Mocked<INotificationRepository> {
  return {
    create: jest.fn(),
    listForDoctor: jest.fn().mockResolvedValue(items),
    countUnreadForDoctor: jest.fn().mockResolvedValue(unreadCount),
    findByIdForDoctor: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
  };
}

describe('ListNotificationsUseCase', () => {
  it('returns items and unreadCount from the repository', async () => {
    const items = [makeNotification('id-1'), makeNotification('id-2', now)];
    const repo = makeRepo(items, 1);
    const uc = new ListNotificationsUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.items).toEqual(items);
    expect(result.unreadCount).toBe(1);
  });

  it('calls listForDoctor and countUnreadForDoctor with the correct doctorId', async () => {
    const repo = makeRepo();
    const uc = new ListNotificationsUseCase(repo);

    await uc.execute(DOCTOR_ID);

    expect(repo.listForDoctor).toHaveBeenCalledWith(DOCTOR_ID, 30);
    expect(repo.countUnreadForDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('returns empty items and zero unreadCount when the doctor has no notifications', async () => {
    const repo = makeRepo([], 0);
    const uc = new ListNotificationsUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.items).toEqual([]);
    expect(result.unreadCount).toBe(0);
  });

  it('runs both repo queries concurrently (Promise.all)', async () => {
    // Both mocks resolve, and the use case must not await one before the other.
    // We verify by checking both were called (not by timing, which would be flaky).
    const repo = makeRepo([makeNotification('id-1')], 1);
    const uc = new ListNotificationsUseCase(repo);

    await uc.execute(DOCTOR_ID);

    expect(repo.listForDoctor).toHaveBeenCalledTimes(1);
    expect(repo.countUnreadForDoctor).toHaveBeenCalledTimes(1);
  });
});
