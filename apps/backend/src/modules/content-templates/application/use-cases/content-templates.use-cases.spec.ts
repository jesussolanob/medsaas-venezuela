import { ContentTemplate } from '../../domain/entities/content-template.entity';
import { ContentTemplateNotFoundError } from '../../domain/errors/content-template-not-found.error';
import { InvalidTemplateContentError } from '../../domain/errors/invalid-template-content.error';
import type { IContentTemplateRepository } from '../../domain/repositories/icontent-template.repository';
import { ListContentTemplatesUseCase } from './list-content-templates.use-case';
import { GetContentTemplateUseCase } from './get-content-template.use-case';
import { CreateContentTemplateUseCase } from './create-content-template.use-case';
import { UpdateContentTemplateUseCase } from './update-content-template.use-case';
import { DeleteContentTemplateUseCase } from './delete-content-template.use-case';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR = 'eeeeeeee-0000-0000-0000-000000000002';
const TEMPLATE_ID = 'tttttttt-0000-0000-0000-000000000001';

function makeTemplate(
  overrides?: Partial<ConstructorParameters<typeof ContentTemplate>[0]>,
): ContentTemplate {
  return ContentTemplate.create({
    id: TEMPLATE_ID,
    doctorId: DOCTOR_ID,
    type: 'recipe',
    name: 'Plantilla A',
    content: { medications: [], notes: '' },
    createdAt: new Date('2026-10-22T00:00:00Z'),
    updatedAt: new Date('2026-10-22T00:00:00Z'),
    ...overrides,
  });
}

function mockRepo(): jest.Mocked<IContentTemplateRepository> {
  return {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  } as jest.Mocked<IContentTemplateRepository>;
}

// ---------------------------------------------------------------------------
// ListContentTemplatesUseCase
// ---------------------------------------------------------------------------

describe('ListContentTemplatesUseCase', () => {
  it('returns templates for the doctor', async () => {
    const repo = mockRepo();
    const t = makeTemplate();
    repo.list.mockResolvedValue([t]);
    const uc = new ListContentTemplatesUseCase(repo);

    const result = await uc.execute(DOCTOR_ID, {});

    expect(repo.list).toHaveBeenCalledWith({ doctorId: DOCTOR_ID, type: undefined });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(TEMPLATE_ID);
  });

  it('passes type filter through', async () => {
    const repo = mockRepo();
    repo.list.mockResolvedValue([]);
    const uc = new ListContentTemplatesUseCase(repo);

    await uc.execute(DOCTOR_ID, { type: 'paraclinical' });

    expect(repo.list).toHaveBeenCalledWith({ doctorId: DOCTOR_ID, type: 'paraclinical' });
  });

  it('caps results at 500 even if the repository returns more', async () => {
    const repo = mockRepo();
    const manyTemplates = Array.from({ length: 600 }, (_, i) =>
      makeTemplate({ id: `tttttttt-0000-0000-0000-${String(i).padStart(12, '0')}` }),
    );
    repo.list.mockResolvedValue(manyTemplates);
    const uc = new ListContentTemplatesUseCase(repo);

    const result = await uc.execute(DOCTOR_ID, {});

    expect(result).toHaveLength(500);
  });
});

// ---------------------------------------------------------------------------
// GetContentTemplateUseCase
// ---------------------------------------------------------------------------

describe('GetContentTemplateUseCase', () => {
  it('returns a template owned by the doctor', async () => {
    const repo = mockRepo();
    const t = makeTemplate();
    repo.findById.mockResolvedValue(t);
    const uc = new GetContentTemplateUseCase(repo);

    const result = await uc.execute(TEMPLATE_ID, DOCTOR_ID);

    expect(result.id).toBe(TEMPLATE_ID);
  });

  it('throws ContentTemplateNotFoundError when not found', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(null);
    const uc = new GetContentTemplateUseCase(repo);

    await expect(uc.execute(TEMPLATE_ID, DOCTOR_ID)).rejects.toBeInstanceOf(
      ContentTemplateNotFoundError,
    );
  });

  it('throws ContentTemplateNotFoundError for foreign doctor (anti-IDOR)', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(makeTemplate());
    const uc = new GetContentTemplateUseCase(repo);

    await expect(uc.execute(TEMPLATE_ID, OTHER_DOCTOR)).rejects.toBeInstanceOf(
      ContentTemplateNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// CreateContentTemplateUseCase
// ---------------------------------------------------------------------------

describe('CreateContentTemplateUseCase', () => {
  it('creates a template and returns it', async () => {
    const repo = mockRepo();
    const t = makeTemplate();
    repo.create.mockResolvedValue(t);
    const uc = new CreateContentTemplateUseCase(repo);

    const result = await uc.execute(
      { type: 'recipe', name: 'Plantilla A', content: { medications: [], notes: '' } },
      DOCTOR_ID,
    );

    expect(repo.create).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      type: 'recipe',
      name: 'Plantilla A',
      content: { medications: [], notes: '' },
    });
    expect(result.id).toBe(TEMPLATE_ID);
  });

  it('trims whitespace from name', async () => {
    const repo = mockRepo();
    repo.create.mockResolvedValue(makeTemplate({ name: 'Plantilla B' }));
    const uc = new CreateContentTemplateUseCase(repo);

    await uc.execute(
      { type: 'recipe', name: '  Plantilla B  ', content: { medications: [], notes: '' } },
      DOCTOR_ID,
    );

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Plantilla B' }));
  });
});

// ---------------------------------------------------------------------------
// UpdateContentTemplateUseCase
// ---------------------------------------------------------------------------

describe('UpdateContentTemplateUseCase', () => {
  it('updates name and returns template', async () => {
    const repo = mockRepo();
    const t = makeTemplate();
    repo.findById.mockResolvedValue(t);
    repo.update.mockResolvedValue(makeTemplate({ name: 'Nuevo nombre' }));
    const uc = new UpdateContentTemplateUseCase(repo);

    const result = await uc.execute(TEMPLATE_ID, DOCTOR_ID, { name: 'Nuevo nombre' });

    expect(repo.update).toHaveBeenCalledWith(
      TEMPLATE_ID,
      expect.objectContaining({ name: 'Nuevo nombre' }),
    );
    expect(result.name).toBe('Nuevo nombre');
  });

  it('throws ContentTemplateNotFoundError when not found', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(null);
    const uc = new UpdateContentTemplateUseCase(repo);

    await expect(uc.execute(TEMPLATE_ID, DOCTOR_ID, { name: 'X' })).rejects.toBeInstanceOf(
      ContentTemplateNotFoundError,
    );
  });

  it('throws ContentTemplateNotFoundError for foreign doctor', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(makeTemplate());
    const uc = new UpdateContentTemplateUseCase(repo);

    await expect(uc.execute(TEMPLATE_ID, OTHER_DOCTOR, { name: 'X' })).rejects.toBeInstanceOf(
      ContentTemplateNotFoundError,
    );
  });

  it('throws InvalidTemplateContentError when content type mismatches stored type', async () => {
    const repo = mockRepo();
    // recipe template — paraclinical content should be rejected
    repo.findById.mockResolvedValue(makeTemplate({ type: 'recipe' }));
    const uc = new UpdateContentTemplateUseCase(repo);

    await expect(
      uc.execute(TEMPLATE_ID, DOCTOR_ID, {
        content: { items: [{ exam_name: 'Hemograma', notes: '' }] } as never,
      }),
    ).rejects.toBeInstanceOf(InvalidTemplateContentError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('accepts valid content matching the stored type', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(makeTemplate({ type: 'recipe' }));
    repo.update.mockResolvedValue(makeTemplate({ type: 'recipe' }));
    const uc = new UpdateContentTemplateUseCase(repo);

    await expect(
      uc.execute(TEMPLATE_ID, DOCTOR_ID, {
        content: {
          medications: [
            {
              name: 'Ibuprofeno',
              dose: '400mg',
              route: 'oral',
              frequency: 'c/8h',
              duration: '5 días',
              presentation: '',
              indications: '',
            },
          ],
          notes: '',
        },
      }),
    ).resolves.toBeDefined();
    expect(repo.update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DeleteContentTemplateUseCase
// ---------------------------------------------------------------------------

describe('DeleteContentTemplateUseCase', () => {
  it('deletes a template owned by the doctor', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(makeTemplate());
    repo.delete.mockResolvedValue(undefined);
    const uc = new DeleteContentTemplateUseCase(repo);

    await uc.execute(TEMPLATE_ID, DOCTOR_ID);

    expect(repo.delete).toHaveBeenCalledWith(TEMPLATE_ID);
  });

  it('throws ContentTemplateNotFoundError when not found', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(null);
    const uc = new DeleteContentTemplateUseCase(repo);

    await expect(uc.execute(TEMPLATE_ID, DOCTOR_ID)).rejects.toBeInstanceOf(
      ContentTemplateNotFoundError,
    );
  });

  it('throws ContentTemplateNotFoundError for foreign doctor', async () => {
    const repo = mockRepo();
    repo.findById.mockResolvedValue(makeTemplate());
    const uc = new DeleteContentTemplateUseCase(repo);

    await expect(uc.execute(TEMPLATE_ID, OTHER_DOCTOR)).rejects.toBeInstanceOf(
      ContentTemplateNotFoundError,
    );
  });
});
