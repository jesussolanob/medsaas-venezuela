import { GetUnseenReleaseNotesUseCase } from './get-unseen-release-notes.use-case';
import type {
  IReleaseNoteRepository,
  UnseenNoteItem,
} from '../../domain/repositories/irelease-note.repository';

const makeUnseen = (overrides: Partial<UnseenNoteItem> = {}): UnseenNoteItem => ({
  id: 'note-1',
  title: 'Novedad 1',
  body: 'Contenido de la novedad',
  imageUrl: null,
  publishedAt: new Date('2026-10-30T12:00:00Z'),
  ...overrides,
});

describe('GetUnseenReleaseNotesUseCase', () => {
  let useCase: GetUnseenReleaseNotesUseCase;
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

    useCase = new GetUnseenReleaseNotesUseCase(mockRepo);
  });

  it('returns empty list when no unseen notes', async () => {
    mockRepo.findUnseenForDoctor.mockResolvedValue([]);

    const result = await useCase.execute('doctor-1');

    expect(result.items).toEqual([]);
  });

  it('passes doctorId to repository', async () => {
    mockRepo.findUnseenForDoctor.mockResolvedValue([]);

    await useCase.execute('doctor-uuid-1');

    expect(mockRepo.findUnseenForDoctor).toHaveBeenCalledWith('doctor-uuid-1');
  });

  it('serializes publishedAt to ISO string', async () => {
    const publishedAt = new Date('2026-10-30T12:00:00Z');
    mockRepo.findUnseenForDoctor.mockResolvedValue([makeUnseen({ publishedAt })]);

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.publishedAt).toBe(publishedAt.toISOString());
  });

  it('returns at most 5 items (repository handles limit)', async () => {
    const items = Array.from({ length: 3 }, (_, i) =>
      makeUnseen({ id: `note-${i + 1}`, title: `Novedad ${i + 1}` }),
    );
    mockRepo.findUnseenForDoctor.mockResolvedValue(items);

    const result = await useCase.execute('doctor-1');

    expect(result.items.length).toBe(3);
  });

  it('includes imageUrl in output', async () => {
    mockRepo.findUnseenForDoctor.mockResolvedValue([
      makeUnseen({ imageUrl: 'https://storage.googleapis.com/bucket/notes/img.png' }),
    ]);

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.imageUrl).toBe('https://storage.googleapis.com/bucket/notes/img.png');
  });

  it('returns null imageUrl when not set', async () => {
    mockRepo.findUnseenForDoctor.mockResolvedValue([makeUnseen({ imageUrl: null })]);

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.imageUrl).toBeNull();
  });
});
