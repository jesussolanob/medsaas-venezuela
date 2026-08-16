import { QueryTypes } from 'sequelize';
import { SequelizePendingConsultationRepository } from './sequelize-pending-consultation.repository';
import type { PackageUsageRow } from '../../../domain/repositories/pending-consultation.repository';

/**
 * Unit tests for SequelizePendingConsultationRepository.getPackageUsage.
 *
 * We mock sequelize.query to avoid a real database connection.  The tests
 * verify that the raw SQL result is correctly mapped to the PackageUsageRow
 * domain shape.
 *
 * `mockSequelize` is typed as `{ query: jest.Mock }` — a loose type — to avoid
 * fighting Sequelize's overloaded query signature while still asserting call args.
 */

const DOCTOR_ID = 'doc-uuid-1111-2222-3333-444444444444';
const PATIENT_ID = 'pat-uuid-1111-2222-3333-444444444444';
const PATIENT_ID_2 = 'pat-uuid-2222-3333-4444-555555555555';

interface RawRowInput {
  patient_id?: string;
  plan_name?: string;
  total_sessions?: number | null;
  attended?: number;
  scheduled?: number;
  no_show?: number;
  pending_scheduling?: number;
}

function makeRawRow(overrides: RawRowInput = {}) {
  return {
    patient_id: PATIENT_ID,
    plan_name: 'Terapia Completa',
    total_sessions: 6,
    // Counts come as numbers because the SQL casts them with ::int
    attended: 2,
    scheduled: 1,
    no_show: 1,
    pending_scheduling: 2,
    ...overrides,
  };
}

describe('SequelizePendingConsultationRepository.getPackageUsage', () => {
  let repo: SequelizePendingConsultationRepository;
  // Loose type: avoids fighting Sequelize's overloaded query signature.
  let mockSequelize: { query: jest.Mock };

  beforeEach(() => {
    mockSequelize = { query: jest.fn() };

    repo = new SequelizePendingConsultationRepository(
      // model is not used by getPackageUsage — pass a no-op stub
      {} as never,
      mockSequelize as never,
    );
  });

  // -------------------------------------------------------------------
  // Single patient mode
  // -------------------------------------------------------------------

  it('passes doctorId and patientId as replacements when patientId is provided', async () => {
    mockSequelize.query.mockResolvedValue([]);

    await repo.getPackageUsage(DOCTOR_ID, PATIENT_ID);

    expect(mockSequelize.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        replacements: { doctorId: DOCTOR_ID, patientId: PATIENT_ID },
        type: QueryTypes.SELECT,
      }),
    );
  });

  it('maps raw row to domain shape including patientId', async () => {
    mockSequelize.query.mockResolvedValue([makeRawRow()]);

    const result = await repo.getPackageUsage(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(1);
    const row = result[0] as PackageUsageRow;
    expect(row.patientId).toBe(PATIENT_ID);
    expect(row.planName).toBe('Terapia Completa');
    expect(row.totalSessions).toBe(6);
    expect(row.attended).toBe(2);
    expect(row.scheduled).toBe(1);
    expect(row.noShow).toBe(1);
    expect(row.pendingScheduling).toBe(2);
  });

  // -------------------------------------------------------------------
  // Bulk mode (no patientId)
  // -------------------------------------------------------------------

  it('passes only doctorId as replacement when patientId is absent', async () => {
    mockSequelize.query.mockResolvedValue([]);

    await repo.getPackageUsage(DOCTOR_ID);

    expect(mockSequelize.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        replacements: { doctorId: DOCTOR_ID },
        type: QueryTypes.SELECT,
      }),
    );
  });

  it('el SQL solo lleva el filtro de paciente cuando hay paciente', async () => {
    mockSequelize.query.mockResolvedValue([]);

    await repo.getPackageUsage(DOCTOR_ID, PATIENT_ID);
    const [conFiltro] = mockSequelize.query.mock.calls[0] as [string];
    expect(conFiltro).toContain('patient_id = :patientId');

    mockSequelize.query.mockClear();
    await repo.getPackageUsage(DOCTOR_ID);
    const [sinFiltro] = mockSequelize.query.mock.calls[0] as [string];
    // Si el fragmento quedara pegado sin el replacement, Sequelize reventaría en
    // runtime y el test de arriba (que solo mira replacements) no lo vería.
    expect(sinFiltro).not.toContain(':patientId');
    expect(sinFiltro).toContain('doctor_id  = :doctorId');
  });

  it('no agrupa por nombre con JOIN: el total sale de una subconsulta escalar', async () => {
    mockSequelize.query.mockResolvedValue([]);

    await repo.getPackageUsage(DOCTOR_ID, PATIENT_ID);
    const [sql] = mockSequelize.query.mock.calls[0] as [string];

    // Un JOIN por nombre duplicaria la fila del paquete si el especialista
    // repite el nombre de un servicio (mismo criterio que el repo de consultas).
    expect(sql).not.toMatch(/JOIN\s+pricing_plans/i);
    expect(sql).toMatch(/SELECT pp\.sessions_count/);
  });

  it('returns rows for multiple patients in bulk mode', async () => {
    mockSequelize.query.mockResolvedValue([
      makeRawRow({ patient_id: PATIENT_ID, plan_name: 'Combo A', attended: 3 }),
      makeRawRow({ patient_id: PATIENT_ID_2, plan_name: 'Combo B', attended: 1 }),
    ]);

    const result = await repo.getPackageUsage(DOCTOR_ID);

    expect(result).toHaveLength(2);
    const [rowA, rowB] = result as [PackageUsageRow, PackageUsageRow];
    expect(rowA.patientId).toBe(PATIENT_ID);
    expect(rowA.planName).toBe('Combo A');
    expect(rowA.attended).toBe(3);
    expect(rowB.patientId).toBe(PATIENT_ID_2);
    expect(rowB.planName).toBe('Combo B');
    expect(rowB.attended).toBe(1);
  });

  // -------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------

  it('returns totalSessions: null when the plan was deleted from the catalog', async () => {
    mockSequelize.query.mockResolvedValue([makeRawRow({ total_sessions: null })]);

    const result = await repo.getPackageUsage(DOCTOR_ID, PATIENT_ID);

    expect((result[0] as PackageUsageRow).totalSessions).toBeNull();
  });

  it('handles zero-value counts correctly', async () => {
    mockSequelize.query.mockResolvedValue([
      makeRawRow({ attended: 0, scheduled: 0, no_show: 0, pending_scheduling: 3 }),
    ]);

    const result = await repo.getPackageUsage(DOCTOR_ID, PATIENT_ID);

    const row = result[0] as PackageUsageRow;
    expect(row.attended).toBe(0);
    expect(row.scheduled).toBe(0);
    expect(row.noShow).toBe(0);
    expect(row.pendingScheduling).toBe(3);
  });

  it('returns empty array when query returns no rows', async () => {
    mockSequelize.query.mockResolvedValue([]);

    const result = await repo.getPackageUsage(DOCTOR_ID, PATIENT_ID);

    expect(result).toEqual([]);
  });

  it('maps multiple rows for a single patient correctly', async () => {
    mockSequelize.query.mockResolvedValue([
      makeRawRow({ plan_name: 'Paquete A', total_sessions: 3, attended: 3, pending_scheduling: 0 }),
      makeRawRow({
        plan_name: 'Paquete B',
        total_sessions: null,
        attended: 0,
        pending_scheduling: 2,
      }),
    ]);

    const result = await repo.getPackageUsage(DOCTOR_ID, PATIENT_ID);

    expect(result).toHaveLength(2);
    const [rowA, rowB] = result as [PackageUsageRow, PackageUsageRow];
    expect(rowA.planName).toBe('Paquete A');
    expect(rowA.totalSessions).toBe(3);
    expect(rowB.planName).toBe('Paquete B');
    expect(rowB.totalSessions).toBeNull();
    expect(rowB.pendingScheduling).toBe(2);
  });
});
