import { ListReleaseNotesAdminUseCase } from './list-release-notes-admin.use-case';
import type {
  IReleaseNoteRepository,
  AdminListItem,
} from '../../domain/repositories/irelease-note.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
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

// UUID that matches the isValidNoteImagePath regex: logo/<uuid>/<file>
const VALID_UUID = '12345678-1234-1234-1234-123456789012';
const SIGNED_URL = 'https://storage.googleapis.com/bucket/logo/doc-1/ts-img.jpg?X-Goog-sig=abc';

describe('ListReleaseNotesAdminUseCase', () => {
  let useCase: ListReleaseNotesAdminUseCase;
  let mockRepo: jest.Mocked<IReleaseNoteRepository>;
  let mockStorage: jest.Mocked<IStoragePort>;

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

    mockStorage = {
      upload: jest.fn(),
      getSignedUrl: jest.fn(),
    } as jest.Mocked<IStoragePort>;

    useCase = new ListReleaseNotesAdminUseCase(mockRepo, mockStorage);
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

  it('re-signs stored image path via getSignedUrl', async () => {
    const storedPath = `logo/${VALID_UUID}/1730000000000-note-img.jpg`;
    mockRepo.adminList.mockResolvedValue({
      items: [makeAdminItem({ imageUrl: storedPath })],
      total: 1,
    });
    mockStorage.getSignedUrl.mockResolvedValue(SIGNED_URL);

    const result = await useCase.execute({ status: 'all', limit: 50, offset: 0 });

    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(storedPath, expect.any(Number));
    expect(result.items[0]!.imageUrl).toBe(SIGNED_URL);
  });

  it('returns null imageUrl for legacy full GCS URL stored in DB (path guard blocks re-signing)', async () => {
    // A full GCS URL stored before the security fix is blocked by isValidNoteImagePath
    // because it does not match `logo/<uuid>/<file>`. No signing is attempted.
    const legacyUrl =
      'https://storage.googleapis.com/my-bucket/logo/admin-1/img.jpg?X-Goog-Algorithm=AWS4';
    mockRepo.adminList.mockResolvedValue({
      items: [makeAdminItem({ imageUrl: legacyUrl })],
      total: 1,
    });

    const result = await useCase.execute({ status: 'all', limit: 50, offset: 0 });

    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    expect(result.items[0]!.imageUrl).toBeNull();
  });

  it('returns null imageUrl when re-signing fails — does not throw', async () => {
    mockRepo.adminList.mockResolvedValue({
      items: [makeAdminItem({ imageUrl: `logo/${VALID_UUID}/img.jpg` })],
      total: 1,
    });
    mockStorage.getSignedUrl.mockRejectedValue(new Error('GCS unavailable'));

    const result = await useCase.execute({ status: 'all', limit: 50, offset: 0 });

    expect(result.items[0]!.imageUrl).toBeNull();
  });

  it('returns null imageUrl for forbidden stored path — receipt prefix (IDOR guard)', async () => {
    // A crafted path pointing to another module's storage is blocked at read time.
    mockRepo.adminList.mockResolvedValue({
      items: [makeAdminItem({ imageUrl: `receipt/${VALID_UUID}/receipt.pdf` })],
      total: 1,
    });

    const result = await useCase.execute({ status: 'all', limit: 50, offset: 0 });

    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    expect(result.items[0]!.imageUrl).toBeNull();
  });

  it('returns null imageUrl when imageUrl is null in DB', async () => {
    mockRepo.adminList.mockResolvedValue({ items: [makeAdminItem()], total: 1 });

    const result = await useCase.execute({ status: 'all', limit: 50, offset: 0 });

    expect(result.items[0]!.imageUrl).toBeNull();
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
  });
});
