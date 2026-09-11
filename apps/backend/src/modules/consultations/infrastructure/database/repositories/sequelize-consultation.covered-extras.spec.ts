/**
 * Invariant tests — extras payment in covered sessions (package sessions 2..N).
 *
 * CONTEXT:
 *   A patient buys a package of 4 sessions for $160. Session 1 carries the
 *   full $160; sessions 2..4 have amount=0 ("cubierta por paquete"). When the
 *   doctor approves extras (products / services) for session 2, the new logic in
 *   approveWithExtras MUST:
 *
 *     1. NEVER modify the package payment (appointments.payment_id on that session
 *        points to the $160 payment row that covers all sessions).
 *     2. INSERT a standalone extras payment linked via payments.consultation_id.
 *     3. Keep the extras payment idempotent: re-approving updates the row, not
 *        duplicates it (ON CONFLICT DO UPDATE in the SQL).
 *     4. Non-covered sessions (session_number IS NULL) must behave exactly as
 *        before — UPDATE the appointment-linked payment, do NOT insert extras row.
 *
 * These tests exercise SequelizeConsultationRepository directly with a mocked
 * Sequelize, following the same pattern established in §8 inventory tests.
 */
import { QueryTypes } from 'sequelize';
import { SequelizeConsultationRepository } from './sequelize-consultation.repository';

// ── Fixed UUIDs ──────────────────────────────────────────────────────────────

const DOCTOR_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PATIENT_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const CONSULTATION_ID = 'cccccccc-0000-0000-0000-000000000003';

// ── Query substrings used for mock routing ───────────────────────────────────

const Q_CONSULT_LOCK = 'SELECT id FROM consultations';
const Q_BASE_AMOUNT = 'SELECT c.base_amount';
const Q_OLD_MOVEMENTS = 'SELECT DISTINCT product_id';
const Q_FOR_UPDATE = 'FOR UPDATE';
const Q_DELETE_MVMT = 'DELETE FROM inventory_movements';
const Q_UPDATE_CONSULT = 'UPDATE consultations';
// Non-covered path (session_number IS NULL)
const Q_UPDATE_PAY = 'UPDATE payments pp';
// Covered path (session_number IS NOT NULL)
const Q_INS_EXTRAS_PAY = 'INSERT INTO payments';
// Step 6 re-read
const Q_STEP6 = 'c.patient_id, c.appointment_id';

// ── Minimal Step 6 re-read row ────────────────────────────────────────────────

const step6Row = {
  id: CONSULTATION_ID,
  doctor_id: DOCTOR_ID,
  patient_id: PATIENT_ID,
  appointment_id: null,
  consultation_code: 'DLT-202609-0042',
  consultation_date: '2026-09-11T00:00:00Z',
  chief_complaint: null,
  diagnosis: null,
  treatment: null,
  notes: null,
  payment_status: 'approved',
  payment_method: 'zelle',
  amount: '20',
  base_amount: '0',
  payment_date: '2026-09-11T00:00:00Z',
  payment_reference: null,
  payment_receipt_url: null,
  blocks_snapshot: null,
  blocks_structure: null,
  created_at: '2026-09-11T00:00:00Z',
  updated_at: '2026-09-11T00:00:00Z',
  patient_full_name_enc: null,
  appointment_status: null,
  session_number: 2,
  package_total_sessions: 4,
  package_charge_usd: '160',
  appt_plan_name: 'Paquete 4 sesiones',
};

// ── Factory ──────────────────────────────────────────────────────────────────

interface MakeRepoOptions {
  /** session_number returned by the Step 1 base query. Non-null = covered session. */
  sessionNumber: number | null;
  /** base_amount stored in the consultation row (null = first approval). */
  baseAmount?: string | null;
  /** current consultation amount (used when base_amount is null). */
  amount?: string;
}

function makeRepo(opts: MakeRepoOptions) {
  const { sessionNumber, baseAmount = null, amount = '0' } = opts;

  const updatePayCalls: string[] = [];
  const insExtraPayReplacements: Record<string, unknown>[] = [];
  const updateSiblingCalls: string[] = [];

  const mockQuery = jest
    .fn()
    .mockImplementation(
      async (
        sql: string,
        options?: { replacements?: Record<string, unknown>; type?: QueryTypes },
      ) => {
        if (sql.includes(Q_CONSULT_LOCK)) {
          return [];
        }
        if (sql.includes(Q_BASE_AMOUNT)) {
          return [
            {
              base_amount: baseAmount,
              amount,
              plan_price: '0',
              session_number: sessionNumber,
              patient_id: PATIENT_ID,
            },
          ];
        }
        if (sql.includes(Q_OLD_MOVEMENTS)) {
          return []; // no previous sale movements
        }
        if (sql.includes(Q_FOR_UPDATE)) {
          return []; // product row lock (no products in these tests)
        }
        if (sql.includes(Q_DELETE_MVMT)) {
          return [0, 0];
        }
        if (sql.includes(Q_UPDATE_PAY)) {
          updatePayCalls.push(sql);
          return [0, 0];
        }
        if (sql.includes(Q_INS_EXTRAS_PAY)) {
          if (options?.replacements) {
            insExtraPayReplacements.push(options.replacements);
          }
          return [1, 1];
        }
        if (sql.includes(Q_UPDATE_CONSULT) && sql.includes('UPDATE consultations')) {
          // Catches Step 5 (consult update) AND Step 5c (sibling sync).
          updateSiblingCalls.push(sql);
          return [0, 0];
        }
        if (sql.includes(Q_STEP6)) {
          // Step 6 re-read: adapt session_number in the response if needed.
          return [{ ...step6Row, session_number: sessionNumber }];
        }
        return [];
      },
    );

  const mockTransaction = {};
  const mockSequelize = {
    transaction: jest
      .fn()
      .mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb(mockTransaction)),
    query: mockQuery,
  };

  const mockExtraModel = {
    destroy: jest.fn().mockResolvedValue(0),
    bulkCreate: jest.fn().mockResolvedValue([]),
  };
  const mockConsultationModel = {
    update: jest.fn().mockResolvedValue([1, []]),
  };
  const mockCrypto = {
    decrypt: jest.fn().mockReturnValue(null),
  };

  const repo = new SequelizeConsultationRepository(
    mockConsultationModel as never,
    mockExtraModel as never,
    mockCrypto as never,
    mockSequelize as never,
  );

  return {
    repo,
    mockQuery,
    updatePayCalls,
    insExtraPayReplacements,
    updateSiblingCalls,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('approveWithExtras — covered session invariants', () => {
  /**
   * INVARIANT 1 (core financial safety):
   *
   * When session_number IS NOT NULL the code MUST NOT run the
   * "UPDATE payments pp SET amount_usd = :total" query that would overwrite
   * the package payment. This test catches any regression that removes the
   * session_number guard introduced in 20260911000002.
   *
   * A $20 extras approval on session 2 of a $160 package MUST leave the $160
   * package payment untouched. Verifiable proof: the UPDATE payments SQL is
   * never issued.
   */
  it('INVARIANT 1: does NOT run UPDATE payments for a covered session', async () => {
    const { repo, updatePayCalls } = makeRepo({ sessionNumber: 2 });

    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: 'Crema hidratante', amountUsd: 20, productId: null, quantity: null }],
      'zelle',
    );

    // The UPDATE payments pp ... FROM appointments ap path must never execute.
    expect(updatePayCalls).toHaveLength(0);
  });

  /**
   * Covered session extras payment IS inserted into the payments table.
   *
   * The INSERT must carry:
   *   - doctor_id, patient_id, consultation_id from the consultation
   *   - amount_usd = total = sum(extras)  (base is 0 for covered sessions)
   *   - method_snapshot = paymentMethod passed by the caller
   *   - status = 'approved' (set directly in the SQL)
   */
  it('inserts a standalone extras payment for a covered session', async () => {
    const { repo, insExtraPayReplacements } = makeRepo({ sessionNumber: 2 });

    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: 'Consulta extra', amountUsd: 20, productId: null, quantity: null }],
      'pago_movil',
    );

    expect(insExtraPayReplacements).toHaveLength(1);
    const repl = insExtraPayReplacements[0]!;

    // Ownership
    expect(repl['doctorId']).toBe(DOCTOR_ID);
    expect(repl['patientId']).toBe(PATIENT_ID);
    expect(repl['consultationId']).toBe(CONSULTATION_ID);

    // Financial correctness: total = 0 (base) + 20 (extra) = 20
    expect(repl['total']).toBe(20);

    // Method
    expect(repl['methodSnapshot']).toBe('pago_movil');
  });

  /**
   * INVARIANT 5 (idempotence):
   *
   * The INSERT uses ON CONFLICT (consultation_id) DO UPDATE, so calling
   * approveWithExtras twice on the same covered session must call the INSERT
   * SQL twice (the conflict branch handles de-duplication at the DB level).
   * The test verifies the SQL is called each time — the ON CONFLICT clause
   * is in the SQL string, confirming the upsert semantics.
   */
  it('INVARIANT 5: extras payment SQL contains ON CONFLICT for idempotent upsert', async () => {
    const { repo, mockQuery } = makeRepo({ sessionNumber: 3 });

    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: 'Servicio A', amountUsd: 15, productId: null, quantity: null }],
      'zelle',
    );

    const insertCall = mockQuery.mock.calls.find(([sql]: [string]) =>
      sql.includes(Q_INS_EXTRAS_PAY),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![0]).toContain('ON CONFLICT (consultation_id)');
    expect(insertCall![0]).toContain('DO UPDATE SET');
  });

  /**
   * INVARIANT 6 (zero regression):
   *
   * When session_number IS NULL (non-covered session), the existing UPDATE
   * payments path must still run and the INSERT extras payment must NOT run.
   * The existing §8 tests also guard this — this test makes the intent explicit.
   */
  it('INVARIANT 6: non-covered session runs UPDATE payments, not INSERT extras', async () => {
    const { repo, updatePayCalls, insExtraPayReplacements } = makeRepo({ sessionNumber: null });

    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: 'Servicio extra', amountUsd: 30, productId: null, quantity: null }],
      'zelle',
    );

    // The UPDATE payments pp path must run.
    expect(updatePayCalls.length).toBeGreaterThanOrEqual(1);

    // The INSERT INTO payments (extras payment) must NOT run.
    expect(insExtraPayReplacements).toHaveLength(0);
  });

  /**
   * Covered session with no extras (empty array):
   * base_amount = 0, total = 0, extras payment is inserted with amount_usd = 0.
   * This is an edge case (doctor approves without adding extras) but must not crash.
   */
  it('covered session with no extras inserts a $0 extras payment without error', async () => {
    const { repo, insExtraPayReplacements } = makeRepo({ sessionNumber: 2 });

    await repo.approveWithExtras(CONSULTATION_ID, DOCTOR_ID, [], 'efectivo');

    expect(insExtraPayReplacements).toHaveLength(1);
    expect(insExtraPayReplacements[0]!['total']).toBe(0);
  });

  /**
   * Re-approval of a covered session (base_amount already set from first approval).
   * The base stays at 0, total = new sum(extras). The INSERT is called again
   * but ON CONFLICT keeps only one payment row.
   */
  it('re-approval of covered session uses stored base_amount=0, updates total', async () => {
    const { repo, insExtraPayReplacements } = makeRepo({
      sessionNumber: 2,
      baseAmount: '0', // already set from first approval
      amount: '15', // previous total from first approval
    });

    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: 'Servicio B', amountUsd: 25, productId: null, quantity: null }],
      'zelle',
    );

    // base_amount stored = 0, so resolvedBase = 0; total = 0 + 25 = 25
    expect(insExtraPayReplacements).toHaveLength(1);
    expect(insExtraPayReplacements[0]!['total']).toBe(25);
  });
});
