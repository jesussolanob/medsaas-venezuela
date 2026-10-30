import { GetReleaseNotesHistoryUseCase } from './get-release-notes-history.use-case';
import type {
  IReleaseNoteRepository,
  UnseenNoteItem,
} from '../../domain/repositories/irelease-note.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';

const makeItem = (overrides: Partial<UnseenNoteItem> = {}): UnseenNoteItem => ({
  id: 'note-1',
  title: 'Novedad histórica',
  body: 'Detalle de la novedad',
  imageUrl: null,
  publishedAt: new Date('2026-10-30T10:00:00Z'),
  ...overrides,
});

const SIGNED_URL = 'https://storage.googleapis.com/bucket/logo/doc-1/ts-img.jpg?X-Goog-sig=abc';

describe('GetReleaseNotesHistoryUseCase', () => {
  let useCase: GetReleaseNotesHistoryUseCase;
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

    useCase = new GetReleaseNotesHistoryUseCase(mockRepo, mockStorage);
  });

  it('returns empty list when doctor has no published notes', async () => {
    mockRepo.findPublishedForDoctor.mockResolvedValue([]);

    const result = await useCase.execute('doctor-1');

    expect(result.items).toEqual([]);
  });

  it('passes doctorId to repository', async () => {
    mockRepo.findPublishedForDoctor.mockResolvedValue([]);

    await useCase.execute('doctor-uuid-1');

    expect(mockRepo.findPublishedForDoctor).toHaveBeenCalledWith('doctor-uuid-1');
  });

  it('serializes publishedAt to ISO string', async () => {
    const publishedAt = new Date('2026-10-30T12:00:00Z');
    mockRepo.findPublishedForDoctor.mockResolvedValue([makeItem({ publishedAt })]);

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.publishedAt).toBe(publishedAt.toISOString());
  });

  it('re-signs stored image path via getSignedUrl', async () => {
    const storedPath = 'logo/doctor-1/1730000000000-photo.jpg';
    mockRepo.findPublishedForDoctor.mockResolvedValue([makeItem({ imageUrl: storedPath })]);
    mockStorage.getSignedUrl.mockResolvedValue(SIGNED_URL);

    const result = await useCase.execute('doctor-1');

    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(storedPath, expect.any(Number));
    expect(result.items[0]!.imageUrl).toBe(SIGNED_URL);
  });

  it('re-signs legacy full GCS URL by extracting its path', async () => {
    const legacyUrl =
      'https://storage.googleapis.com/my-bucket/logo/doc-1/photo.jpg?X-Goog-Algorithm=AWS4';
    mockRepo.findPublishedForDoctor.mockResolvedValue([makeItem({ imageUrl: legacyUrl })]);
    mockStorage.getSignedUrl.mockResolvedValue(SIGNED_URL);

    const result = await useCase.execute('doctor-1');

    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(
      'logo/doc-1/photo.jpg',
      expect.any(Number),
    );
    expect(result.items[0]!.imageUrl).toBe(SIGNED_URL);
  });

  it('returns null imageUrl when re-signing fails — does not throw', async () => {
    mockRepo.findPublishedForDoctor.mockResolvedValue([
      makeItem({ imageUrl: 'logo/doctor-1/photo.jpg' }),
    ]);
    mockStorage.getSignedUrl.mockRejectedValue(new Error('GCS unavailable'));

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.imageUrl).toBeNull();
  });

  it('returns null imageUrl when imageUrl is null in DB', async () => {
    mockRepo.findPublishedForDoctor.mockResolvedValue([makeItem({ imageUrl: null })]);

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.imageUrl).toBeNull();
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('re-signs each item independently — one failure does not break the rest', async () => {
    const items = [
      makeItem({ id: 'note-1', imageUrl: 'logo/doc-1/photo1.jpg' }),
      makeItem({ id: 'note-2', imageUrl: 'logo/doc-1/photo2.jpg' }),
    ];
    mockRepo.findPublishedForDoctor.mockResolvedValue(items);
    mockStorage.getSignedUrl
      .mockRejectedValueOnce(new Error('GCS error'))
      .mockResolvedValueOnce(SIGNED_URL);

    const result = await useCase.execute('doctor-1');

    expect(result.items[0]!.imageUrl).toBeNull();
    expect(result.items[1]!.imageUrl).toBe(SIGNED_URL);
  });
});
