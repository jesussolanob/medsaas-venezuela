import { UnpublishReleaseNoteUseCase } from './unpublish-release-note.use-case';
import type { IReleaseNoteRepository } from '../../domain/repositories/irelease-note.repository';
import { ReleaseNoteNotFoundError } from '../../domain/errors/release-note-not-found.error';
import { ReleaseNoteInvalidTransitionError } from '../../domain/errors/release-note-invalid-transition.error';
import { ReleaseNote } from '../../domain/entities/release-note.entity';

const makeNote = (overrides: Partial<Parameters<typeof ReleaseNote.create>[0]> = {}): ReleaseNote =>
  ReleaseNote.create({
    id: 'note-uuid-1',
    title: 'Título',
    body: 'Cuerpo',
    imageUrl: null,
    audiencePlans: null,
    publishedAt: null,
    createdBy: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

describe('UnpublishReleaseNoteUseCase', () => {
  let useCase: UnpublishReleaseNoteUseCase;
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

    useCase = new UnpublishReleaseNoteUseCase(mockRepo);
  });

  it('unpublishes a published note', async () => {
    mockRepo.findById.mockResolvedValue(
      makeNote({ publishedAt: new Date('2026-10-30T12:00:00Z') }),
    );
    const draftNote = makeNote();
    mockRepo.unpublish.mockResolvedValue(draftNote);

    const result = await useCase.execute('note-uuid-1');

    expect(result.publishedAt).toBeNull();
    expect(mockRepo.unpublish).toHaveBeenCalledWith('note-uuid-1');
  });

  it('throws ReleaseNoteNotFoundError when note does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing')).rejects.toThrow(ReleaseNoteNotFoundError);
  });

  it('throws ReleaseNoteInvalidTransitionError when note is already a draft', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());

    await expect(useCase.execute('note-uuid-1')).rejects.toThrow(ReleaseNoteInvalidTransitionError);

    expect(mockRepo.unpublish).not.toHaveBeenCalled();
  });
});
