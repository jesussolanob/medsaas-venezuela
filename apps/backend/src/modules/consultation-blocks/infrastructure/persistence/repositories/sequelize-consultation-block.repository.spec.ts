import { SequelizeConsultationBlockRepository } from './sequelize-consultation-block.repository';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';

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
