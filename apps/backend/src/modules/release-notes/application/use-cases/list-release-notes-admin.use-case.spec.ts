import { ListReleaseNotesAdminUseCase } from './list-release-notes-admin.use-case';
import type {
  IReleaseNoteRepository,
  AdminListItem,
} from '../../domain/repositories/irelease-note.repository';
import { ReleaseNote } from '../../domain/entities/release-note.entity';

const makeAdminItem = (
  overrides: Partial<Parameters<typeof ReleaseNote.create>[0]> = {},
): AdminListItem => {
  const note = ReleaseNote.create({
    id: 'note-1',
    title: 'Novedad de prueba',
    body: 'Cuerpo',
    imageUrl: null,
    audiencePlans: null,
    publishedAt: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-30T10:00:00Z'),
    updatedAt: new Date('2026-10-30T10:00:00Z'),
    ...overrides,
  });
  // AdminListItem extends ReleaseNote (a class), so we return the note instance with createdByName
  return Object.assign(note, { createdByName: 'Lucas Rivas' }) as AdminListItem;
};

describe('ListReleaseNotesAdminUseCase', () => {
  let useCase: ListReleaseNotesAdminUseCase;
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

    useCase = new ListReleaseNotesAdminUseCase(mockRepo);
  });

  it('returns an empty list', async () => {
    mockRepo.adminList.mockResolvedValue({ items: [], total: 0 });

    const result = await useCase.execute({ status: 'all', limit: 50, offset: 0 });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns items with createdByName', async () => {
    mockRepo.adminList.mockResolvedValue({
      items: [makeAdminItem()],
      total: 1,
    });

    const result = await useCase.execute({ status: 'all', limit: 50, offset: 0 });

    expect(result.items[0]!.createdByName).toBe('Lucas Rivas');
  });

  it('passes status filter to repository', async () => {
    mockRepo.adminList.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({ status: 'published', limit: 20, offset: 0 });

    expect(mockRepo.adminList).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', limit: 20, offset: 0 }),
    );
  });

  it('serializes publishedAt to ISO string', async () => {
    const publishedAt = new Date('2026-10-30T12:00:00Z');
    mockRepo.adminList.mockResolvedValue({
      items: [makeAdminItem({ publishedAt })],
      total: 1,
    });

    const result = await useCase.execute({ status: 'all', limit: 50, offset: 0 });

    expect(result.items[0]!.publishedAt).toBe(publishedAt.toISOString());
  });

  it('returns null publishedAt for drafts', async () => {
    mockRepo.adminList.mockResolvedValue({
      items: [makeAdminItem()],
      total: 1,
    });

    const result = await useCase.execute({ status: 'draft', limit: 50, offset: 0 });

    expect(result.items[0]!.publishedAt).toBeNull();
  });
});
