import { UpdateReleaseNoteUseCase } from './update-release-note.use-case';
import type { IReleaseNoteRepository } from '../../domain/repositories/irelease-note.repository';
import { ReleaseNoteNotFoundError } from '../../domain/errors/release-note-not-found.error';
import { ReleaseNoteInvalidError } from '../../domain/errors/release-note-invalid.error';
import { ReleaseNoteAudienceInvalidError } from '../../domain/errors/release-note-audience-invalid.error';
import { ReleaseNote } from '../../domain/entities/release-note.entity';

// UUID that matches the isValidNoteImagePath regex: logo/<uuid>/<file>
const VALID_UUID = '12345678-1234-1234-1234-123456789012';

const makeNote = (overrides: Partial<Parameters<typeof ReleaseNote.create>[0]> = {}): ReleaseNote =>
  ReleaseNote.create({
    id: 'note-uuid-1',
    title: 'Título original',
    body: 'Cuerpo original',
    imageUrl: null,
    audiencePlans: null,
    publishedAt: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-30T10:00:00Z'),
    updatedAt: new Date('2026-10-30T10:00:00Z'),
    ...overrides,
  });

describe('UpdateReleaseNoteUseCase', () => {
  let useCase: UpdateReleaseNoteUseCase;
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

    useCase = new UpdateReleaseNoteUseCase(mockRepo);
  });

  it('updates a draft note successfully', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    const updatedNote = makeNote({ title: 'Título actualizado' });
    mockRepo.update.mockResolvedValue(updatedNote);

    const result = await useCase.execute('note-uuid-1', { title: 'Título actualizado' });

    expect(result.title).toBe('Título actualizado');
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('throws ReleaseNoteNotFoundError when note does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing-id', { title: 'Nuevo' })).rejects.toThrow(
      ReleaseNoteNotFoundError,
    );
  });

  it('throws ReleaseNoteInvalidError when updated title is too long', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());

    await expect(useCase.execute('note-uuid-1', { title: 'A'.repeat(81) })).rejects.toThrow(
      ReleaseNoteInvalidError,
    );
  });

  it('throws ReleaseNoteInvalidError when updated body contains HTML', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());

    await expect(useCase.execute('note-uuid-1', { body: '<script>xss</script>' })).rejects.toThrow(
      ReleaseNoteInvalidError,
    );
  });

  it('throws ReleaseNoteAudienceInvalidError for unknown plan key', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());
    mockRepo.findAllPlanKeys.mockResolvedValue(['delta_base']);

    await expect(
      useCase.execute('note-uuid-1', { audiencePlans: ['unknown_plan'] }),
    ).rejects.toThrow(ReleaseNoteAudienceInvalidError);
  });

  it('allows editing a published note', async () => {
    const publishedNote = makeNote({ publishedAt: new Date('2026-10-30T12:00:00Z') });
    mockRepo.findById.mockResolvedValue(publishedNote);
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    mockRepo.update.mockResolvedValue(publishedNote);

    const result = await useCase.execute('note-uuid-1', { body: 'Cuerpo actualizado' });

    expect(result.publishedAt).not.toBeNull();
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('trims updated title and body', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    mockRepo.update.mockResolvedValue(makeNote());

    await useCase.execute('note-uuid-1', { title: '  Nuevo título  ', body: '  Nuevo cuerpo  ' });

    expect(mockRepo.update).toHaveBeenCalledWith(
      'note-uuid-1',
      expect.objectContaining({ title: 'Nuevo título', body: 'Nuevo cuerpo' }),
    );
  });

  it('stores a bare path unchanged when imageUrl is already a path', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    const storedPath = `logo/${VALID_UUID}/1730000000000-photo.jpg`;
    mockRepo.update.mockResolvedValue(makeNote({ imageUrl: storedPath }));

    await useCase.execute('note-uuid-1', { imageUrl: storedPath });

    expect(mockRepo.update).toHaveBeenCalledWith(
      'note-uuid-1',
      expect.objectContaining({ imageUrl: storedPath }),
    );
  });

  it('normalizes a full GCS URL to its bare object path before storing', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    const fullUrl = `https://storage.googleapis.com/my-bucket/logo/${VALID_UUID}/photo.jpg?X-Goog-Algorithm=AWS4`;
    mockRepo.update.mockResolvedValue(makeNote({ imageUrl: `logo/${VALID_UUID}/photo.jpg` }));

    await useCase.execute('note-uuid-1', { imageUrl: fullUrl });

    expect(mockRepo.update).toHaveBeenCalledWith(
      'note-uuid-1',
      expect.objectContaining({ imageUrl: `logo/${VALID_UUID}/photo.jpg` }),
    );
  });

  // IDOR path-guard regression tests (security fix 2026-10-30)
  it('throws ReleaseNoteInvalidError when imageUrl has a receipt prefix (IDOR guard)', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());

    await expect(
      useCase.execute('note-uuid-1', { imageUrl: `receipt/${VALID_UUID}/receipt.pdf` }),
    ).rejects.toThrow(ReleaseNoteInvalidError);
  });

  it('throws ReleaseNoteInvalidError when imageUrl contains a path traversal segment', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());

    await expect(
      useCase.execute('note-uuid-1', { imageUrl: `logo/${VALID_UUID}/../secret.jpg` }),
    ).rejects.toThrow(ReleaseNoteInvalidError);
  });

  it('throws ReleaseNoteInvalidError when imageUrl is an external URL', async () => {
    mockRepo.findById.mockResolvedValue(makeNote());

    await expect(
      useCase.execute('note-uuid-1', { imageUrl: 'https://evil.example.com/tracker.png' }),
    ).rejects.toThrow(ReleaseNoteInvalidError);
  });
});
