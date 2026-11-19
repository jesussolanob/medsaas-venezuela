import { RenameBlockLabelUseCase } from './rename-block-label.use-case';
import type { IConsultationBlockRepository } from '../../../domain/repositories/consultation-block.repository';
import { InvalidBlockKeyError } from '../../../domain/errors/invalid-block-key.error';
import { LockedBlockKeyError } from '../../../domain/errors/locked-block-key.error';

const DOCTOR_ID = 'doctor-uuid-001';

/** Minimal catalog with two catalog entries: one unlocked, one locked. */
const CATALOG_ROWS = [
  {
    key: 'physical_exam',
    defaultLabel: 'Examen físico',
    defaultContentType: 'rich_text',
    defaultPrintable: true,
    defaultSendToPatient: true,
    defaultEnabled: false,
    defaultSortOrder: 5,
    description: null,
  },
  {
    key: 'tasks',
    defaultLabel: 'Tareas terapéuticas',
    defaultContentType: 'rich_text',
    defaultPrintable: true,
    defaultSendToPatient: true,
    defaultEnabled: false,
    defaultSortOrder: 7,
    description: null,
  },
  {
    // A locked key: included to verify rejection.
    key: 'chief_complaint',
    defaultLabel: 'Motivo de consulta',
    defaultContentType: 'rich_text',
    defaultPrintable: true,
    defaultSendToPatient: true,
    defaultEnabled: true,
    defaultSortOrder: 0,
    description: null,
  },
];

function makeRepo(): jest.Mocked<IConsultationBlockRepository> {
  return {
    listCatalog: jest.fn().mockResolvedValue(CATALOG_ROWS),
    getCatalogKeySet: jest.fn(),
    listSpecialtyDefaults: jest.fn().mockResolvedValue([]),
    listDoctorBlocks: jest.fn().mockResolvedValue([]),
    getDoctorSpecialty: jest.fn().mockResolvedValue(null),
    replaceDoctorBlocks: jest.fn(),
    resolveBlocks: jest.fn(),
    getDoctorLayout: jest.fn().mockResolvedValue('tabs'),
    setDoctorLayout: jest.fn().mockResolvedValue(undefined),
    upsertBlockLabel: jest.fn().mockResolvedValue(undefined),
  };
}

describe('RenameBlockLabelUseCase', () => {
  let useCase: RenameBlockLabelUseCase;
  let repo: jest.Mocked<IConsultationBlockRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new RenameBlockLabelUseCase(repo);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it('calls upsertBlockLabel with the custom_label and returns effective label', async () => {
    const result = await useCase.execute(DOCTOR_ID, 'physical_exam', {
      custom_label: 'Mi examen',
    });

    expect(repo.upsertBlockLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: DOCTOR_ID,
        blockKey: 'physical_exam',
        customLabel: 'Mi examen',
      }),
    );
    expect(result).toEqual({
      blockKey: 'physical_exam',
      customLabel: 'Mi examen',
      label: 'Mi examen',
    });
  });

  it('restores catalog default when custom_label is null', async () => {
    const result = await useCase.execute(DOCTOR_ID, 'physical_exam', {
      custom_label: null,
    });

    expect(repo.upsertBlockLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        customLabel: null,
      }),
    );
    expect(result).toEqual({
      blockKey: 'physical_exam',
      customLabel: null,
      label: 'Examen físico', // catalog defaultLabel
    });
  });

  it('always uses doctorId from the argument (anti-IDOR)', async () => {
    await useCase.execute(DOCTOR_ID, 'tasks', { custom_label: 'Mis tareas' });

    expect(repo.upsertBlockLabel).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: DOCTOR_ID }),
    );
  });

  // ── Fallback cascade when no doctor row exists ────────────────────────────

  it('passes catalog fallback enabled/sortOrder when no specialty default exists', async () => {
    repo.getDoctorSpecialty.mockResolvedValue(null);
    repo.listSpecialtyDefaults.mockResolvedValue([]);

    await useCase.execute(DOCTOR_ID, 'physical_exam', { custom_label: 'X' });

    expect(repo.upsertBlockLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackEnabled: false, // catalog defaultEnabled
        fallbackSortOrder: 5, // catalog defaultSortOrder
      }),
    );
  });

  it('uses specialty default fallback when specialty entry exists for the key', async () => {
    repo.getDoctorSpecialty.mockResolvedValue('Fisioterapia');
    repo.listSpecialtyDefaults.mockResolvedValue([
      { specialty: 'Fisioterapia', blockKey: 'physical_exam', enabled: true, sortOrder: 2 },
    ]);

    await useCase.execute(DOCTOR_ID, 'physical_exam', { custom_label: 'X' });

    expect(repo.upsertBlockLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackEnabled: true, // specialty default
        fallbackSortOrder: 2, // specialty default
      }),
    );
  });

  // ── Error: invalid blockKey ────────────────────────────────────────────────

  it('throws InvalidBlockKeyError when blockKey does not exist in catalog', async () => {
    await expect(
      useCase.execute(DOCTOR_ID, 'nonexistent_block', { custom_label: 'X' }),
    ).rejects.toThrow(InvalidBlockKeyError);
    expect(repo.upsertBlockLabel).not.toHaveBeenCalled();
  });

  it('InvalidBlockKeyError mentions the offending key', async () => {
    await expect(
      useCase.execute(DOCTOR_ID, 'fake_block', { custom_label: 'X' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('fake_block') });
  });

  // ── Error: locked blockKey ─────────────────────────────────────────────────

  it('throws LockedBlockKeyError when blockKey is in LOCKED_BLOCK_KEYS', async () => {
    await expect(
      useCase.execute(DOCTOR_ID, 'chief_complaint', { custom_label: 'X' }),
    ).rejects.toThrow(LockedBlockKeyError);
    expect(repo.upsertBlockLabel).not.toHaveBeenCalled();
  });

  it('LockedBlockKeyError mentions the offending key', async () => {
    await expect(
      useCase.execute(DOCTOR_ID, 'chief_complaint', { custom_label: 'X' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('chief_complaint') });
  });

  it.each(['chief_complaint', 'history', 'diagnosis', 'prescription', 'indications', 'rest'])(
    'rejects renaming locked key: %s',
    async (key) => {
      // Add key to catalog mock so we don't get InvalidBlockKeyError first
      repo.listCatalog.mockResolvedValue([
        ...CATALOG_ROWS,
        {
          key,
          defaultLabel: 'Sistema',
          defaultContentType: 'rich_text',
          defaultPrintable: true,
          defaultSendToPatient: true,
          defaultEnabled: true,
          defaultSortOrder: 0,
          description: null,
        },
      ]);

      await expect(useCase.execute(DOCTOR_ID, key, { custom_label: 'X' })).rejects.toThrow(
        LockedBlockKeyError,
      );
    },
  );

  // ── Error codes ───────────────────────────────────────────────────────────

  it('LockedBlockKeyError has httpStatus 400 and correct code', () => {
    const err = new LockedBlockKeyError('foo');
    expect(err.code).toBe('LOCKED_BLOCK_KEY');
    expect(err.httpStatus).toBe(400);
  });
});
