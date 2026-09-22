import { MarkAsReadUseCase } from './mark-as-read.use-case';
import type { INotificationRepository } from '../../domain/repositories/inotification.repository';
import { NotificationNotFoundError } from '../../domain/errors/notification-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
const NOTIF_ID = 'nnnnnnnn-0000-0000-0000-000000000001';

function makeRepo(markAsReadResult: boolean): jest.Mocked<INotificationRepository> {
  return {
    create: jest.fn(),
    listForDoctor: jest.fn(),
    countUnreadForDoctor: jest.fn(),
    findByIdForDoctor: jest.fn(),
    markAsRead: jest.fn().mockResolvedValue(markAsReadResult),
    markAllAsRead: jest.fn(),
  };
}

describe('MarkAsReadUseCase', () => {
  describe('successful mark', () => {
    it('calls repo.markAsRead and returns {id, readAt}', async () => {
      const repo = makeRepo(true);
      const uc = new MarkAsReadUseCase(repo);

      const result = await uc.execute(NOTIF_ID, DOCTOR_ID);

      expect(repo.markAsRead).toHaveBeenCalledWith(NOTIF_ID, DOCTOR_ID, expect.any(Date));
      expect(result.id).toBe(NOTIF_ID);
      expect(result.readAt).toBeInstanceOf(Date);
    });
  });

  describe('anti-IDOR — not found or wrong doctor', () => {
    it('throws NotificationNotFoundError when the repo returns false', async () => {
      const repo = makeRepo(false);
      const uc = new MarkAsReadUseCase(repo);

      await expect(uc.execute(NOTIF_ID, OTHER_DOCTOR_ID)).rejects.toThrow(
        NotificationNotFoundError,
      );
    });

    it('throws NotificationNotFoundError for a missing notification', async () => {
      const repo = makeRepo(false);
      const uc = new MarkAsReadUseCase(repo);

      await expect(uc.execute('does-not-exist', DOCTOR_ID)).rejects.toThrow(
        NotificationNotFoundError,
      );
    });
  });
});
