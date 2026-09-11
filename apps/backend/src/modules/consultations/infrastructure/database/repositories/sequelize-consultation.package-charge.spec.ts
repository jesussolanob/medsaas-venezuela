/**
 * SQL-string unit tests — package_charge_usd subquery exclusion of cancelled appointments.
 *
 * WHAT THESE TESTS VERIFY
 * These tests use a mocked Sequelize instance and capture the SQL strings sent
 * to `sequelize.query()`. They assert that the strings contain the expected
 * clause — `a1.status <> 'cancelled'` — in every method that embeds the
 * PACKAGE_CHARGE_SUBQUERY constant.
 *
 * HONEST LIMIT
 * This is a SQL-string assertion, NOT a behavioral test. It verifies what SQL
 * the code emits; it does NOT verify that Postgres actually filters the rows
 * correctly. For behavioral coverage, see the integration spec
 * (`sequelize-consultation.repository.integration.spec.ts`), which runs against
 * a real Postgres instance and is excluded from the default test run.
 *
 * REGRESSION CONTEXT
 * Verified in staging 2026-09-10: a $120 package showed as $0.00 because a
 * cancelled appointment (session_number IS NULL, plan_price = 0) was the
 * earliest by scheduled_at and won the LIMIT 1.
 */
import { SequelizeConsultationRepository } from './sequelize-consultation.repository';

// ── Fixed IDs ────────────────────────────────────────────────────────────────

const DOCTOR_ID = 'eeeeeeee-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'ffffffff-0000-0000-0000-000000000002';

// ── Query discriminators (substrings used to route mock responses) ────────────

const Q_FINDBYID_SELECT = 'p.full_name AS patient_full_name_enc';
const Q_LIST_COUNT = 'SELECT COUNT(*) AS cnt';
const Q_LIST_SELECT = 'a.session_number,\n         a.plan_name AS appt_plan_name';
const Q_PACKAGE_CHARGE = 'package_charge_usd';
const Q_CANCELLED = "a1.status        <> 'cancelled'";

// Minimal enriched row for findById / list / step-6 re-reads.
const minimalEnrichedRow = {
  id: CONSULTATION_ID,
  doctor_id: DOCTOR_ID,
  patient_id: null,
  appointment_id: null,
  consultation_code: 'DLT-202609-0001',
  consultation_date: '2026-09-10T10:00:00Z',
  chief_complaint: null,
  diagnosis: null,
  treatment: null,
  notes: null,
  payment_status: 'pending',
  payment_method: null,
  amount: null,
  base_amount: null,
  payment_date: null,
  payment_reference: null,
  payment_receipt_url: null,
  blocks_snapshot: null,
  blocks_structure: null,
  created_at: '2026-09-10T00:00:00Z',
  updated_at: '2026-09-10T00:00:00Z',
  patient_full_name_enc: null,
  appointment_status: null,
  session_number: null,
  appt_plan_name: null,
  package_total_sessions: null,
  package_charge_usd: '120',
};

// ── Mock factory ──────────────────────────────────────────────────────────────

/**
 * Builds a SequelizeConsultationRepository backed by a mock Sequelize that
 * records every SQL string passed to `query()`.
 */
function makeRepo() {
  const capturedSqls: string[] = [];

  const mockQuery = jest.fn().mockImplementation(async (sql: string) => {
    capturedSqls.push(sql);

    if (sql.includes(Q_LIST_COUNT)) return [{ cnt: '0' }];
    if (sql.includes(Q_FINDBYID_SELECT) || sql.includes(Q_LIST_SELECT)) {
      return [minimalEnrichedRow];
    }
    return [];
  });

  const mockTransaction = {};
  const mockSequelize = {
    transaction: jest
      .fn()
      .mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(mockTransaction)),
    query: mockQuery,
  };

  const fakeCrypto = { encrypt: (v: string) => v, decrypt: (v: string) => v };
  const mockConsultationModel = { findOne: jest.fn().mockResolvedValue(null) };
  const mockExtraModel = {};

  const repo = new SequelizeConsultationRepository(
    mockConsultationModel as never,
    mockExtraModel as never,
    fakeCrypto as never,
    mockSequelize as never,
  );

  return { repo, capturedSqls };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("PACKAGE_CHARGE_SUBQUERY — excludes 'cancelled' appointments", () => {
  it("findById emits package_charge_usd subquery with AND a1.status <> 'cancelled'", async () => {
    const { repo, capturedSqls } = makeRepo();

    await repo.findById(CONSULTATION_ID, DOCTOR_ID);

    const packageChargeSql = capturedSqls.find((s) => s.includes(Q_PACKAGE_CHARGE));
    expect(packageChargeSql).toBeDefined();
    // SQL-string assertion only — verifies what is emitted, not Postgres behaviour.
    expect(packageChargeSql).toContain(Q_CANCELLED);
  });

  it("list() emits package_charge_usd subquery with AND a1.status <> 'cancelled'", async () => {
    const { repo, capturedSqls } = makeRepo();

    await repo.list({
      doctorId: DOCTOR_ID,
      page: 1,
      limit: 10,
    });

    const packageChargeSql = capturedSqls.find((s) => s.includes(Q_PACKAGE_CHARGE));
    expect(packageChargeSql).toBeDefined();
    // SQL-string assertion only — verifies what is emitted, not Postgres behaviour.
    expect(packageChargeSql).toContain(Q_CANCELLED);
  });
});
