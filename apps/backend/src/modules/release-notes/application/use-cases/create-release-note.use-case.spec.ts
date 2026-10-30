import { CreateReleaseNoteUseCase } from './create-release-note.use-case';
import type { IReleaseNoteRepository } from '../../domain/repositories/irelease-note.repository';
import { ReleaseNoteInvalidError } from '../../domain/errors/release-note-invalid.error';
import { ReleaseNoteAudienceInvalidError } from '../../domain/errors/release-note-audience-invalid.error';
import { ReleaseNote } from '../../domain/entities/release-note.entity';

const ACTOR_ID = 'admin-uuid-1';

const makeNote = (overrides: Partial<Parameters<typeof ReleaseNote.create>[0]> = {}): ReleaseNote =>
  ReleaseNote.create({
    id: 'note-uuid-1',
    title: 'Título de prueba',
    body: 'Cuerpo de la novedad',
    imageUrl: null,
    audiencePlans: null,
    publishedAt: null,
    createdBy: ACTOR_ID,
    createdAt: new Date('2026-10-30T10:00:00Z'),
    updatedAt: new Date('2026-10-30T10:00:00Z'),
    ...overrides,
  });

describe('CreateReleaseNoteUseCase', () => {
  let useCase: CreateReleaseNoteUseCase;
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

    useCase = new CreateReleaseNoteUseCase(mockRepo);
  });

  it('creates a draft release note successfully', async () => {
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(makeNote());

    const result = await useCase.execute(
      { title: 'Título de prueba', body: 'Cuerpo de la novedad' },
      ACTOR_ID,
    );

    expect(result.id).toBe('note-uuid-1');
    expect(result.publishedAt).toBeNull();
    expect(result.title).toBe('Título de prueba');
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });

  it('creates note with audiencePlans when keys exist', async () => {
    mockRepo.findAllPlanKeys.mockResolvedValue(['delta_base', 'delta_plus']);
    mockRepo.create.mockResolvedValue(makeNote({ audiencePlans: ['delta_plus'] }));

    const result = await useCase.execute(
      { title: 'Solo Plus', body: 'Contenido', audiencePlans: ['delta_plus'] },
      ACTOR_ID,
    );

    expect(result.audiencePlans).toEqual(['delta_plus']);
  });

  it('throws ReleaseNoteInvalidError when title is empty', async () => {
    await expect(useCase.execute({ title: '', body: 'Cuerpo válido' }, ACTOR_ID)).rejects.toThrow(
      ReleaseNoteInvalidError,
    );
  });

  it('throws ReleaseNoteInvalidError when title exceeds 80 chars', async () => {
    await expect(
      useCase.execute({ title: 'A'.repeat(81), body: 'Cuerpo válido' }, ACTOR_ID),
    ).rejects.toThrow(ReleaseNoteInvalidError);
  });

  it('throws ReleaseNoteInvalidError when title contains HTML', async () => {
    await expect(
      useCase.execute({ title: '<b>bold</b>', body: 'Cuerpo válido' }, ACTOR_ID),
    ).rejects.toThrow(ReleaseNoteInvalidError);
  });

  it('throws ReleaseNoteInvalidError when body is empty', async () => {
    await expect(useCase.execute({ title: 'Título válido', body: '' }, ACTOR_ID)).rejects.toThrow(
      ReleaseNoteInvalidError,
    );
  });

  it('throws ReleaseNoteInvalidError when body exceeds 1500 chars', async () => {
    await expect(
      useCase.execute({ title: 'Título válido', body: 'A'.repeat(1501) }, ACTOR_ID),
    ).rejects.toThrow(ReleaseNoteInvalidError);
  });

  it('throws ReleaseNoteInvalidError when body contains HTML', async () => {
    await expect(
      useCase.execute({ title: 'Título válido', body: '<p>HTML</p>' }, ACTOR_ID),
    ).rejects.toThrow(ReleaseNoteInvalidError);
  });

  it('throws ReleaseNoteAudienceInvalidError when plan key does not exist', async () => {
    mockRepo.findAllPlanKeys.mockResolvedValue(['delta_base']);

    await expect(
      useCase.execute(
        { title: 'Título', body: 'Cuerpo', audiencePlans: ['plan_inexistente'] },
        ACTOR_ID,
      ),
    ).rejects.toThrow(ReleaseNoteAudienceInvalidError);
  });

  it('skips plan key validation when audiencePlans is null', async () => {
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(makeNote());

    await useCase.execute({ title: 'Título', body: 'Cuerpo', audiencePlans: null }, ACTOR_ID);

    expect(mockRepo.findAllPlanKeys).not.toHaveBeenCalled();
  });

  it('skips plan key validation when audiencePlans is empty array', async () => {
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(makeNote());

    await useCase.execute({ title: 'Título', body: 'Cuerpo', audiencePlans: [] }, ACTOR_ID);

    expect(mockRepo.findAllPlanKeys).not.toHaveBeenCalled();
  });

  it('trims title and body before creating', async () => {
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(makeNote());

    await useCase.execute({ title: '  Título  ', body: '  Cuerpo  ' }, ACTOR_ID);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Título', body: 'Cuerpo' }),
    );
  });

  it('stores a bare path unchanged when imageUrl is already a path', async () => {
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    const storedPath = 'logo/admin-1/1730000000000-photo.jpg';
    mockRepo.create.mockResolvedValue(makeNote({ imageUrl: storedPath }));

    await useCase.execute({ title: 'Título', body: 'Cuerpo', imageUrl: storedPath }, ACTOR_ID);

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: storedPath }));
  });

  it('normalizes a full GCS URL to its bare object path before storing', async () => {
    mockRepo.findAllPlanKeys.mockResolvedValue([]);
    const fullUrl =
      'https://storage.googleapis.com/my-bucket/logo/admin-1/photo.jpg?X-Goog-Algorithm=AWS4';
    mockRepo.create.mockResolvedValue(makeNote({ imageUrl: 'logo/admin-1/photo.jpg' }));

    await useCase.execute({ title: 'Título', body: 'Cuerpo', imageUrl: fullUrl }, ACTOR_ID);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: 'logo/admin-1/photo.jpg' }),
    );
  });
});
