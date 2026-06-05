import { ListThreadsUseCase } from './list-threads.use-case';
import type { IMessageRepository, ThreadSummary } from '../../../domain/repositories/message.repository';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';

describe('ListThreadsUseCase', () => {
  let useCase: ListThreadsUseCase;
  let mockRepo: jest.Mocked<IMessageRepository>;

  beforeEach(() => {
    mockRepo = {
      listThreads: jest.fn(),
      findThread: jest.fn(),
      markThreadRead: jest.fn(),
      save: jest.fn(),
    };
    useCase = new ListThreadsUseCase(mockRepo);
  });

  it('returns all threads for the given doctor', async () => {
    const threads: ThreadSummary[] = [
      {
        patientId: 'pppppppp-0000-0000-0000-000000000001',
        patientName: 'Juan P.',
        lastMessageAt: new Date('2026-06-05T10:00:00Z'),
        unreadCount: 2,
      },
    ];
    mockRepo.listThreads.mockResolvedValue(threads);

    const result = await useCase.execute(DOCTOR_ID);

    expect(mockRepo.listThreads).toHaveBeenCalledWith(DOCTOR_ID);
    expect(result).toBe(threads);
  });

  it('returns empty array when doctor has no threads', async () => {
    mockRepo.listThreads.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(0);
  });

  it('always passes the doctorId from the actor to the repository (anti-IDOR)', async () => {
    mockRepo.listThreads.mockResolvedValue([]);

    await useCase.execute(DOCTOR_ID);

    expect(mockRepo.listThreads).toHaveBeenCalledWith(DOCTOR_ID);
    expect(mockRepo.listThreads).not.toHaveBeenCalledWith(expect.not.stringContaining(DOCTOR_ID));
  });
});
