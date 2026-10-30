import { GetUnseenReleaseNotesUseCase } from './get-unseen-release-notes.use-case';
import type {
  IReleaseNoteRepository,
  UnseenNoteItem,
} from '../../domain/repositories/irelease-note.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';

const makeUnseen = (overrides: Partial<UnseenNoteItem> = {}): UnseenNoteItem => ({
  id: 'note-1',
  title: 'Novedad 1',
  body: 'Contenido de la novedad',
  imageUrl: null,
  publishedAt: new Date('2026-10-30T12:00:00Z'),
  ...overrides,
});

// UUID that matches the isValidNoteImagePath regex: logo/<uuid>/<file>
const VALID_UUID = '12345678-1234-1234-1234-123456789012';
const SIGNED_URL = 'https://storage.googleapis.com/bucket/logo/doc-1/ts-img.jpg?X-Goog-sig=abc';

describe('GetUnseenReleaseNotesUseCase', () => {
  let useCase: GetUnseenReleaseNotesUseCase;
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

    useCase = new GetUnseenReleaseNotesUseCase(mockRepo, mockStorage);
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

  it('re-signs stored image path via getSignedUrl', async () => {
    const storedPath = `logo/${VALID_UUID}/1730000000000-photo.jpg`;
    mockRepo.findUnseenForDoctor.mockResolvedValue([makeUnseen({ imageUrl: storedPath })]);
    mockStorage.getSignedUrl.mockResolvedValue(SIGNED_URL);

    const result = await useCase.execute('doctor-1');

    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(storedPath, expect.any(Number));
    expect(result.items[0]!.imageUrl).toBe(SIGNED_URL);
  });

  it('returns null imageUrl for legacy full GCS URL stored in DB (path guard blocks re-signing)', async () => {
    // A full GCS URL stored before the security fix is blocked by isValidNoteImagePath
    // because it does not match `logo/<uuid>/<file>`. No signing is attempted.
    const legacyUrl =
      'https://storage.googleapis.com/my-bucket/logo/doc-1/photo.jpg?X-Goog-Algorithm=AWS4';
    mockRepo.findUnseenForDoctor.mockResolvedValue([makeUnseen({ imageUrl: legacyUrl })]);

    const result = await useCase.execute('doctor-1');

    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    expect(result.items[0]!.imageUrl).toBeNull();
  });

  it('returns null imageUrl when re-signing fails — does not throw', async () => {
    const storedPath = `logo/${VALID_UUID}/photo.jpg`;
    mockRepo.findUnseenForDoctor.mockResolvedValue([makeUnseen({ imageUrl: storedPath })]);
    mockStorage.getSignedUrl.mockRejectedValue(new Error('GCS unavailable'));

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.imageUrl).toBeNull();
  });

  it('returns null imageUrl for forbidden stored path — receipt prefix (IDOR guard)', async () => {
    // A crafted path pointing to another module's storage is blocked at read time.
    const forbiddenPath = `receipt/${VALID_UUID}/receipt.pdf`;
    mockRepo.findUnseenForDoctor.mockResolvedValue([makeUnseen({ imageUrl: forbiddenPath })]);

    const result = await useCase.execute('doctor-1');

    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
    expect(result.items[0]!.imageUrl).toBeNull();
  });

  it('returns null imageUrl when imageUrl is null in DB', async () => {
    mockRepo.findUnseenForDoctor.mockResolvedValue([makeUnseen({ imageUrl: null })]);

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.imageUrl).toBeNull();
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('re-signs each item independently — one failure does not break the rest', async () => {
    const items = [
      makeUnseen({ id: 'note-1', imageUrl: `logo/${VALID_UUID}/photo1.jpg` }),
      makeUnseen({ id: 'note-2', imageUrl: `logo/${VALID_UUID}/photo2.jpg` }),
    ];
    mockRepo.findUnseenForDoctor.mockResolvedValue(items);
    mockStorage.getSignedUrl
      .mockRejectedValueOnce(new Error('GCS error'))
      .mockResolvedValueOnce(SIGNED_URL);

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.imageUrl).toBeNull();
    expect(result.items[1]!.imageUrl).toBe(SIGNED_URL);
  });
});
