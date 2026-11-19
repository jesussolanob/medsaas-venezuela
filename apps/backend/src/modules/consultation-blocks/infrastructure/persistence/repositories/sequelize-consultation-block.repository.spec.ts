import { SequelizeConsultationBlockRepository } from './sequelize-consultation-block.repository';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const BLOCK_KEY = 'physical_exam';

/**
 * Unit tests for SequelizeConsultationBlockRepository.getDoctorLayout.
 *
 * The mapping rule is:
 *   - null (never chose) → 'vertical' (default since 2026-08-19; before was 'tabs')
 *   - 'tabs'             → 'tabs'
 *   - 'vertical'         → 'vertical'
 *
 * 'vertical' is the new default so that consultation blocks display like a
 * clinical history read top-to-bottom. A specialist who explicitly saved 'tabs'
 * keeps their preference — only null (never set) changes meaning.
 */
describe('SequelizeConsultationBlockRepository.getDoctorLayout (unit)', () => {
  let mockProfileModel: { findByPk: jest.Mock };
  let repo: SequelizeConsultationBlockRepository;

  beforeEach(() => {
    mockProfileModel = { findByPk: jest.fn() };
    // SequelizeConsultationBlockRepository constructor: catalog, doctorBlock,
    // specialty, profile, sequelize. Only profileModel is used by getDoctorLayout.
    repo = new SequelizeConsultationBlockRepository(
      null as never,
      null as never,
      null as never,
      mockProfileModel as never,
      null as never,
    );
  });

  it('columna null → vertical (nunca eligió, default nuevo)', async () => {
    mockProfileModel.findByPk.mockResolvedValue({
      consultation_blocks_layout: null,
    });

    const result = await repo.getDoctorLayout(DOCTOR_ID);

    expect(result).toBe('vertical');
  });

  it('columna undefined (perfil sin campo) → vertical', async () => {
    mockProfileModel.findByPk.mockResolvedValue({});

    const result = await repo.getDoctorLayout(DOCTOR_ID);

    expect(result).toBe('vertical');
  });

  it('columna tabs → tabs (el especialista eligió pestañas explícitamente)', async () => {
    mockProfileModel.findByPk.mockResolvedValue({
      consultation_blocks_layout: 'tabs',
    });

    const result = await repo.getDoctorLayout(DOCTOR_ID);

    expect(result).toBe('tabs');
  });

  it('columna vertical → vertical (el especialista eligió vertical explícitamente)', async () => {
    mockProfileModel.findByPk.mockResolvedValue({
      consultation_blocks_layout: 'vertical',
    });

    const result = await repo.getDoctorLayout(DOCTOR_ID);

    expect(result).toBe('vertical');
  });

  it('perfil no encontrado (findByPk devuelve null) → vertical', async () => {
    mockProfileModel.findByPk.mockResolvedValue(null);

    const result = await repo.getDoctorLayout(DOCTOR_ID);

    expect(result).toBe('vertical');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// upsertBlockLabel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unit tests for SequelizeConsultationBlockRepository.upsertBlockLabel.
 *
 * The upsert logic:
 *   - Row exists  → update only customLabel via row.update(...)
 *   - Row missing → create a new row with customLabel + fallback enabled/sortOrder
 */
describe('SequelizeConsultationBlockRepository.upsertBlockLabel (unit)', () => {
  let mockDoctorBlockModel: {
    findOne: jest.Mock;
    create: jest.Mock;
  };
  let repo: SequelizeConsultationBlockRepository;

  beforeEach(() => {
    mockDoctorBlockModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    // Constructor: catalog, doctorBlock, specialty, profile, sequelize
    repo = new SequelizeConsultationBlockRepository(
      null as never,
      mockDoctorBlockModel as never,
      null as never,
      null as never,
      null as never,
    );
  });

  it('updates only customLabel when a row already exists', async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    mockDoctorBlockModel.findOne.mockResolvedValue({ update: mockUpdate });

    await repo.upsertBlockLabel({
      doctorId: DOCTOR_ID,
      blockKey: BLOCK_KEY,
      customLabel: 'Mi examen',
      fallbackEnabled: true,
      fallbackSortOrder: 3,
    });

    expect(mockDoctorBlockModel.findOne).toHaveBeenCalledWith({
      where: { doctorId: DOCTOR_ID, blockKey: BLOCK_KEY },
    });
    expect(mockUpdate).toHaveBeenCalledWith({ customLabel: 'Mi examen' });
    expect(mockDoctorBlockModel.create).not.toHaveBeenCalled();
  });

  it('updates customLabel to null when row exists (restores default)', async () => {
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    mockDoctorBlockModel.findOne.mockResolvedValue({ update: mockUpdate });

    await repo.upsertBlockLabel({
      doctorId: DOCTOR_ID,
      blockKey: BLOCK_KEY,
      customLabel: null,
      fallbackEnabled: true,
      fallbackSortOrder: 3,
    });

    expect(mockUpdate).toHaveBeenCalledWith({ customLabel: null });
  });

  it('creates a new row when no existing row is found', async () => {
    mockDoctorBlockModel.findOne.mockResolvedValue(null);
    mockDoctorBlockModel.create.mockResolvedValue(undefined);

    await repo.upsertBlockLabel({
      doctorId: DOCTOR_ID,
      blockKey: BLOCK_KEY,
      customLabel: 'Mi examen',
      fallbackEnabled: false,
      fallbackSortOrder: 5,
    });

    expect(mockDoctorBlockModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorId: DOCTOR_ID,
        blockKey: BLOCK_KEY,
        customLabel: 'Mi examen',
        enabled: false,
        sortOrder: 5,
      }),
    );
  });

  it('new row inherits fallback enabled and sortOrder from cascade resolution', async () => {
    mockDoctorBlockModel.findOne.mockResolvedValue(null);
    mockDoctorBlockModel.create.mockResolvedValue(undefined);

    await repo.upsertBlockLabel({
      doctorId: DOCTOR_ID,
      blockKey: BLOCK_KEY,
      customLabel: null,
      fallbackEnabled: true,
      fallbackSortOrder: 2,
    });

    expect(mockDoctorBlockModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        sortOrder: 2,
        customLabel: null,
        customContentType: null,
        customDescription: null,
        printable: null,
        sendToPatient: null,
      }),
    );
  });
});
