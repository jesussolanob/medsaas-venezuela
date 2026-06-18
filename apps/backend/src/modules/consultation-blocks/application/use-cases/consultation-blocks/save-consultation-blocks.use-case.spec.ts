import { SaveConsultationBlocksUseCase } from './save-consultation-blocks.use-case';
import type { IConsultationBlockRepository } from '../../../domain/repositories/consultation-block.repository';
import { EmptyBlockConfigError } from '../../../domain/errors/empty-block-config.error';
import { InvalidBlockKeyError } from '../../../domain/errors/invalid-block-key.error';

const DOCTOR_ID = 'doctor-uuid-001';

function makeRepo(): jest.Mocked<IConsultationBlockRepository> {
  return {
    listCatalog: jest.fn(),
    getCatalogKeySet: jest.fn(),
    listSpecialtyDefaults: jest.fn(),
    listDoctorBlocks: jest.fn(),
    getDoctorSpecialty: jest.fn(),
    replaceDoctorBlocks: jest.fn(),
    resolveBlocks: jest.fn(),
  };
}

const VALID_KEYS = new Set(['chief_complaint', 'diagnosis', 'treatment', 'prescription']);

describe('SaveConsultationBlocksUseCase', () => {
  let useCase: SaveConsultationBlocksUseCase;
  let repo: jest.Mocked<IConsultationBlockRepository>;

  beforeEach(() => {
    repo = makeRepo();
    repo.getCatalogKeySet.mockResolvedValue(VALID_KEYS);
    repo.replaceDoctorBlocks.mockResolvedValue(2);
    useCase = new SaveConsultationBlocksUseCase(repo);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('saves valid blocks and returns blocks_saved count', async () => {
    const dto = {
      blocks: [
        { block_key: 'chief_complaint', enabled: true },
        { block_key: 'diagnosis', enabled: true },
      ],
    };

    const result = await useCase.execute(DOCTOR_ID, dto);

    expect(result.success).toBe(true);
    expect(result.blocks_saved).toBe(2);
    expect(repo.replaceDoctorBlocks).toHaveBeenCalledTimes(1);
  });

  it('treats blocks without explicit enabled as enabled=true', async () => {
    const dto = {
      blocks: [{ block_key: 'chief_complaint' }],
    };
    repo.replaceDoctorBlocks.mockResolvedValue(1);

    const result = await useCase.execute(DOCTOR_ID, dto);

    expect(result.blocks_saved).toBe(1);
    expect(repo.replaceDoctorBlocks).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({ blockKey: 'chief_complaint', enabled: true }),
        ]),
      }),
    );
  });

  it('passes sort_order defaulting to array index when not provided', async () => {
    let captured: Parameters<IConsultationBlockRepository['replaceDoctorBlocks']>[0] | undefined;
    repo.replaceDoctorBlocks.mockImplementation(async (params) => {
      captured = params;
      return params.blocks.length;
    });

    await useCase.execute(DOCTOR_ID, {
      blocks: [{ block_key: 'chief_complaint' }, { block_key: 'diagnosis', sort_order: 10 }],
    });

    expect(captured?.blocks.at(0)?.sortOrder).toBe(0); // index fallback
    expect(captured?.blocks.at(1)?.sortOrder).toBe(10); // explicit value
  });

  it('passes custom_label, custom_content_type and custom_description correctly', async () => {
    let captured: Parameters<IConsultationBlockRepository['replaceDoctorBlocks']>[0] | undefined;
    repo.replaceDoctorBlocks.mockImplementation(async (params) => {
      captured = params;
      return 1;
    });

    await useCase.execute(DOCTOR_ID, {
      blocks: [
        {
          block_key: 'chief_complaint',
          custom_label: 'Mi motivo',
          custom_content_type: 'list',
          custom_description: 'Mi descripción personalizada',
        },
      ],
    });

    expect(captured?.blocks.at(0)?.customLabel).toBe('Mi motivo');
    expect(captured?.blocks.at(0)?.customContentType).toBe('list');
    expect(captured?.blocks.at(0)?.customDescription).toBe('Mi descripción personalizada');
  });

  it('passes null customDescription when custom_description is omitted', async () => {
    let captured: Parameters<IConsultationBlockRepository['replaceDoctorBlocks']>[0] | undefined;
    repo.replaceDoctorBlocks.mockImplementation(async (params) => {
      captured = params;
      return 1;
    });

    await useCase.execute(DOCTOR_ID, {
      blocks: [{ block_key: 'chief_complaint', enabled: true }],
    });

    expect(captured?.blocks.at(0)?.customDescription).toBeNull();
  });

  it('passes null customDescription when custom_description is explicitly null', async () => {
    let captured: Parameters<IConsultationBlockRepository['replaceDoctorBlocks']>[0] | undefined;
    repo.replaceDoctorBlocks.mockImplementation(async (params) => {
      captured = params;
      return 1;
    });

    await useCase.execute(DOCTOR_ID, {
      blocks: [{ block_key: 'chief_complaint', enabled: true, custom_description: null }],
    });

    expect(captured?.blocks.at(0)?.customDescription).toBeNull();
  });

  // ── EmptyBlockConfigError ─────────────────────────────────────────────────

  it('throws EmptyBlockConfigError when all blocks have enabled=false', async () => {
    const dto = {
      blocks: [
        { block_key: 'chief_complaint', enabled: false },
        { block_key: 'diagnosis', enabled: false },
      ],
    };

    await expect(useCase.execute(DOCTOR_ID, dto)).rejects.toThrow(EmptyBlockConfigError);
    expect(repo.replaceDoctorBlocks).not.toHaveBeenCalled();
  });

  it('does not throw EmptyBlockConfigError when at least one block is enabled', async () => {
    const dto = {
      blocks: [
        { block_key: 'chief_complaint', enabled: false },
        { block_key: 'diagnosis', enabled: true },
      ],
    };
    repo.replaceDoctorBlocks.mockResolvedValue(2);

    await expect(useCase.execute(DOCTOR_ID, dto)).resolves.not.toThrow();
  });

  // ── InvalidBlockKeyError ──────────────────────────────────────────────────

  it('throws InvalidBlockKeyError when a block_key is not in catalog', async () => {
    const dto = {
      blocks: [{ block_key: 'nonexistent_block', enabled: true }],
    };

    await expect(useCase.execute(DOCTOR_ID, dto)).rejects.toThrow(InvalidBlockKeyError);
    expect(repo.replaceDoctorBlocks).not.toHaveBeenCalled();
  });

  it('throws InvalidBlockKeyError naming the offending key', async () => {
    const dto = {
      blocks: [{ block_key: 'bad_key', enabled: true }],
    };

    try {
      await useCase.execute(DOCTOR_ID, dto);
      fail('expected error to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidBlockKeyError);
      expect((e as Error).message).toContain('bad_key');
    }
  });

  it('checks all blocks in order and throws on first invalid key', async () => {
    const dto = {
      blocks: [
        { block_key: 'chief_complaint', enabled: true },
        { block_key: 'FAKE_KEY', enabled: true },
      ],
    };

    await expect(useCase.execute(DOCTOR_ID, dto)).rejects.toThrow(InvalidBlockKeyError);
    expect(repo.replaceDoctorBlocks).not.toHaveBeenCalled();
  });

  // ── Error codes ───────────────────────────────────────────────────────────

  it('EmptyBlockConfigError has httpStatus 400 and correct code', () => {
    const err = new EmptyBlockConfigError();
    expect(err.code).toBe('EMPTY_BLOCK_CONFIG');
    expect(err.httpStatus).toBe(400);
  });

  it('InvalidBlockKeyError has httpStatus 400 and correct code', () => {
    const err = new InvalidBlockKeyError('foo');
    expect(err.code).toBe('INVALID_BLOCK_KEY');
    expect(err.httpStatus).toBe(400);
  });
});
