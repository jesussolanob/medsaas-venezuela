import { MarkAllAsReadUseCase } from './mark-all-as-read.use-case';
import type { INotificationRepository } from '../../domain/repositories/inotification.repository';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';

function makeRepo(count: number): jest.Mocked<INotificationRepository> {
  return {
    create: jest.fn(),
    listForDoctor: jest.fn(),
    countUnreadForDoctor: jest.fn(),
    findByIdForDoctor: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn().mockResolvedValue(count),
  };
}

describe('MarkAllAsReadUseCase', () => {
  it('calls repo.markAllAsRead with doctorId and a Date', async () => {
    const repo = makeRepo(5);
    const uc = new MarkAllAsReadUseCase(repo);

    await uc.execute(DOCTOR_ID);

    expect(repo.markAllAsRead).toHaveBeenCalledWith(DOCTOR_ID, expect.any(Date));
  });

  it('returns the count of updated notifications', async () => {
    const repo = makeRepo(5);
    const uc = new MarkAllAsReadUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.count).toBe(5);
  });

  it('is idempotent — returns { count: 0 } when all are already read', async () => {
    const repo = makeRepo(0);
    const uc = new MarkAllAsReadUseCase(repo);

    const result = await uc.execute(DOCTOR_ID);

    expect(result.count).toBe(0);
  });
});
