import { MarkReleaseNotesSeenUseCase } from './mark-release-notes-seen.use-case';
import type { IReleaseNoteRepository } from '../../domain/repositories/irelease-note.repository';

describe('MarkReleaseNotesSeenUseCase', () => {
  let useCase: MarkReleaseNotesSeenUseCase;
  let mockRepo: jest.Mocked<IReleaseNoteRepository>;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      adminList: jest.fn(),
      update: jest.fn(),
      publish: jest.fn(),
      unpublish: jest.fn(),
      delete: jest.fn(),
      findUnseenForDoctor: jest.fn(),
      findPublishedForDoctor: jest.fn(),
      markSeen: jest.fn(),
      findAllPlanKeys: jest.fn(),
    } as jest.Mocked<IReleaseNoteRepository>;

    useCase = new MarkReleaseNotesSeenUseCase(mockRepo);
  });

  it('marks notes as seen and returns server timestamp', async () => {
    mockRepo.markSeen.mockResolvedValue(undefined);

    const result = await useCase.execute('doctor-uuid-1');

    expect(result.seenAt).toBeDefined();
    expect(new Date(result.seenAt).getTime()).toBeGreaterThan(0);
    expect(mockRepo.markSeen).toHaveBeenCalledWith('doctor-uuid-1', expect.any(Date));
  });

  it('uses server time (not client-provided)', async () => {
    mockRepo.markSeen.mockResolvedValue(undefined);

    const before = new Date();
    const result = await useCase.execute('doctor-uuid-1');
    const after = new Date();

    const seenAt = new Date(result.seenAt);
    expect(seenAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(seenAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
