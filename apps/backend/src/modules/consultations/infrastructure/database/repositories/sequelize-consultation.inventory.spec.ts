/**
 * §8 Regression tests — Inventory sync inside approveWithExtras.
 *
 * These tests run against SequelizeConsultationRepository with a mocked
 * Sequelize instance. They cover the code path that actually executes in
 * production (Steps 2.5, 2.6, 3, 3.5 of approveWithExtras).
 *
 * SyncConsultationSaleMovementsUseCase was deleted because it was orphaned
 * (never called by any production path). The §8 tests now live here.
 */
import { QueryTypes } from 'sequelize';
import { SequelizeConsultationRepository } from './sequelize-consultation.repository';
import { ProductNotFoundError } from '../../../../inventory/domain/errors/product-not-found.error';
import { MissingExchangeRateError } from '../../../domain/errors/missing-exchange-rate.error';
import { InvalidQuantityError } from '../../../../inventory/domain/errors/invalid-quantity.error';

// ── Fixed UUIDs ──────────────────────────────────────────────────────────────

const DOCTOR_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CONSULTATION_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const PRODUCT_A = 'cccccccc-0000-0000-0000-000000000003';
const PRODUCT_B = 'dddddddd-0000-0000-0000-000000000004';

// ── Canonical query substrings used for mock routing ────────────────────────

const Q_CONSULT_LOCK = 'SELECT id FROM consultations'; // H: row lock at start
const Q_BASE_AMOUNT = 'SELECT c.base_amount';
const Q_OLD_MOVEMENTS = 'SELECT DISTINCT product_id';
const Q_FOR_UPDATE = 'FOR UPDATE';
const Q_QTY_RESTORE = 'qty_to_restore';
const Q_DELETE_MVMT = 'DELETE FROM inventory_movements';
const Q_PRODUCT_PRICE = 'SELECT name, sale_price_amount';
const Q_APP_SETTINGS = 'FROM app_settings';
const Q_INS_MVMT = 'INSERT INTO inventory_movements';
const Q_STOCK_DECR = 'stock_qty + :qty';
const Q_UPDATE_PAY = 'UPDATE payments';
const Q_STEP6 = 'c.patient_id, c.appointment_id';

// Minimal consultation row for Step 6 re-read.
const consultationStep6Row = {
  id: CONSULTATION_ID,
  doctor_id: DOCTOR_ID,
  patient_id: null,
  appointment_id: null,
  consultation_code: 'C-001',
  consultation_date: '2026-09-01T00:00:00Z',
  chief_complaint: null,
  diagnosis: null,
  treatment: null,
  notes: null,
  payment_status: 'approved',
  payment_method: null,
  amount: '30',
  base_amount: '30',
  payment_date: '2026-09-01T00:00:00Z',
  payment_reference: null,
  payment_receipt_url: null,
  blocks_snapshot: null,
  blocks_structure: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  patient_full_name_enc: null,
  appointment_status: null,
  session_number: null,
  package_total_sessions: null,
};

// ── Factory ──────────────────────────────────────────────────────────────────

interface MockOptions {
  /** Old sale movements that were already in inventory_movements for this consultation. */
  oldMovements?: Array<{ product_id: string }>;
  /** Product rows returned by the price-lookup query (by productId key). */
  productPriceMap?: Record<
    string,
    { name: string; sale_price_amount: string; sale_price_currency: string }
  >;
  /** Rows returned by the app_settings rate query. */
  appSettingsRows?: Array<{ key: string; value: string }>;
}

function makeRepo(opts: MockOptions = {}) {
  const { oldMovements = [], productPriceMap = {}, appSettingsRows = [] } = opts;

  // Call tracker for assertions on stock changes.
  const stockDecrCalls: Array<{ qty: number; productId: string }> = [];
  const insertMovementReplacements: Record<string, unknown>[] = [];
  let _insertMovementCallCount = 0;

  const mockQuery = jest
    .fn()
    .mockImplementation(
      async (
        sql: string,
        options?: { replacements?: Record<string, unknown>; type?: QueryTypes },
      ) => {
        if (sql.includes(Q_CONSULT_LOCK)) {
          return []; // lock acquired
        }
        if (sql.includes(Q_BASE_AMOUNT)) {
          return [{ base_amount: '30', amount: '30', plan_price: null }];
        }
        if (sql.includes(Q_OLD_MOVEMENTS)) {
          return oldMovements;
        }
        if (sql.includes(Q_FOR_UPDATE)) {
          return [];
        }
        if (sql.includes(Q_QTY_RESTORE)) {
          return [1, 0]; // UPDATE result
        }
        if (sql.includes(Q_DELETE_MVMT)) {
          return [0, 0];
        }
        if (sql.includes(Q_PRODUCT_PRICE)) {
          const productId = options?.replacements?.['productId'] as string | undefined;
          if (productId && productPriceMap[productId]) {
            return [productPriceMap[productId]];
          }
          return []; // not found or not owned → triggers ProductNotFoundError
        }
        if (sql.includes(Q_APP_SETTINGS)) {
          return appSettingsRows;
        }
        if (sql.includes(Q_INS_MVMT)) {
          _insertMovementCallCount++;
          if (options?.replacements) {
            insertMovementReplacements.push(options.replacements);
          }
          return [];
        }
        if (sql.includes(Q_STOCK_DECR)) {
          if (options?.replacements) {
            stockDecrCalls.push({
              qty: options.replacements['qty'] as number,
              productId: options.replacements['productId'] as string,
            });
          }
          return [1, 0];
        }
        if (sql.includes(Q_UPDATE_PAY)) {
          return [0, 0];
        }
        if (sql.includes(Q_STEP6)) {
          return [consultationStep6Row];
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

  return { repo, mockQuery, stockDecrCalls, insertMovementReplacements, mockExtraModel };
}

// ── §8 Tests ──────────────────────────────────────────────────────────────────

describe('§8 — approveWithExtras inventory sync regression tests', () => {
  const usdProduct = {
    name: 'Crema A',
    sale_price_amount: '10.00',
    sale_price_currency: 'USD',
  };

  const vesProduct = {
    name: 'Jarabe VES',
    sale_price_amount: '400.00',
    sale_price_currency: 'VES',
  };

  /**
   * §8-1: Re-approve with the same product line → stock decremented only once net.
   *
   * Pattern verified: Step 2.5 restores stock from old movements BEFORE
   * Step 3.5 applies new ones. A second approval with the same line runs
   * the restore (+qty) then the apply (-qty) — net change = 0.
   * A first approval (no old movements) runs only the apply (-qty).
   */
  it('§8-1: re-approval restores previous movement before applying new one', async () => {
    // Simulate the SECOND call: one old sale movement already exists.
    const { repo, mockQuery, stockDecrCalls } = makeRepo({
      oldMovements: [{ product_id: PRODUCT_A }],
      productPriceMap: { [PRODUCT_A]: usdProduct },
    });

    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: '', amountUsd: 0, productId: PRODUCT_A, quantity: 2 }],
      null,
    );

    // The qty_to_restore UPDATE (step 2.5) must happen before the stock_qty + :qty UPDATE (step 3.5).
    const restoreCallIdx = mockQuery.mock.calls.findIndex(([sql]: [string]) =>
      sql.includes(Q_QTY_RESTORE),
    );
    const applyCallIdx = mockQuery.mock.calls.findIndex(([sql]: [string]) =>
      sql.includes(Q_STOCK_DECR),
    );
    expect(restoreCallIdx).toBeGreaterThanOrEqual(0);
    expect(applyCallIdx).toBeGreaterThanOrEqual(0);
    expect(restoreCallIdx).toBeLessThan(applyCallIdx);

    // The apply step decrements by qty=2 (quantity sent).
    expect(stockDecrCalls).toHaveLength(1);
    expect(stockDecrCalls[0]!.qty).toBe(-2);
    expect(stockDecrCalls[0]!.productId).toBe(PRODUCT_A);
  });

  /**
   * §8-2: Re-approve removing the product line → old movement reverted, no new one applied.
   */
  it('§8-2: removing a product line on re-approval reverts its movement without inserting a new one', async () => {
    const { repo, mockQuery, stockDecrCalls } = makeRepo({
      oldMovements: [{ product_id: PRODUCT_A }],
      productPriceMap: {}, // no products in new extras → product lookup not reached
    });

    // Re-approve with zero product extras.
    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [], // no extras at all — service cleared too
      null,
    );

    // Restore happened (old movement present).
    const restoreCallIdx = mockQuery.mock.calls.findIndex(([sql]: [string]) =>
      sql.includes(Q_QTY_RESTORE),
    );
    expect(restoreCallIdx).toBeGreaterThanOrEqual(0);

    // No new stock decrement.
    expect(stockDecrCalls).toHaveLength(0);

    // No INSERT INTO inventory_movements.
    const insertCallIdx = mockQuery.mock.calls.findIndex(([sql]: [string]) =>
      sql.includes(Q_INS_MVMT),
    );
    expect(insertCallIdx).toBe(-1);
  });

  /**
   * §8-3: VES product → rate_used and rate_source persisted in the movement INSERT.
   */
  it('§8-3: VES product persists rate_used and rate_source in inventory_movements', async () => {
    const { repo, insertMovementReplacements } = makeRepo({
      productPriceMap: { [PRODUCT_A]: vesProduct },
      appSettingsRows: [
        { key: 'usdt_rate', value: '40' },
        { key: 'rate_source', value: 'bnc' },
      ],
    });

    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: '', amountUsd: 0, productId: PRODUCT_A, quantity: 1 }],
      null,
    );

    expect(insertMovementReplacements).toHaveLength(1);
    const repl = insertMovementReplacements[0]!;
    // rate_used = Bs.400 / 40 = 10 USD; stored separately.
    expect(repl['rate_used_0']).toBe(40);
    expect(repl['rate_source_0']).toBe('bnc');
    // unit_price_usd = 400 / 40 = 10.0000
    expect(repl['unit_price_usd_0']).toBe(10);
  });

  /**
   * §8-4: amount_usd (unit_price_usd) is computed from the product's DB price,
   * not from the amountUsd field the client sent.
   */
  it('§8-4: unit price is resolved from DB, client-sent amountUsd is ignored', async () => {
    const { repo, insertMovementReplacements } = makeRepo({
      productPriceMap: { [PRODUCT_A]: usdProduct }, // DB price = 10
    });

    // Client sends amountUsd=999 (should be ignored).
    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: '', amountUsd: 999, productId: PRODUCT_A, quantity: 3 }],
      null,
    );

    const repl = insertMovementReplacements[0]!;
    // unit_price_usd = DB price 10, qty = 3, amountUsd = 10 × 3 = 30 (not 999).
    expect(repl['unit_price_usd_0']).toBe(10);
    expect(repl['qty_0']).toBe(-3); // negative = sale
  });

  /**
   * §8-5: product owned by another doctor → ProductNotFoundError.
   * The product price query uses AND doctor_id = :doctorId, so a foreign product
   * returns an empty result set, which now throws instead of silently proceeding.
   */
  it('§8-5: product from another doctor throws ProductNotFoundError', async () => {
    const { repo } = makeRepo({
      productPriceMap: {}, // empty → product lookup returns []
    });

    await expect(
      repo.approveWithExtras(
        CONSULTATION_ID,
        DOCTOR_ID,
        [{ description: '', amountUsd: 0, productId: PRODUCT_B, quantity: 1 }],
        null,
      ),
    ).rejects.toThrow(ProductNotFoundError);
  });

  /**
   * §8-6: sale that results in negative stock is allowed (no guard in the domain).
   * Doctors can pre-sell inventory they haven't received yet.
   */
  it('§8-6: sale leaving stock negative is accepted without error', async () => {
    const { repo, stockDecrCalls } = makeRepo({
      productPriceMap: { [PRODUCT_A]: { ...usdProduct, sale_price_amount: '10.00' } },
    });

    // qty = 5 but suppose current stock = 2; no guard blocks this.
    await expect(
      repo.approveWithExtras(
        CONSULTATION_ID,
        DOCTOR_ID,
        [{ description: '', amountUsd: 0, productId: PRODUCT_A, quantity: 5 }],
        null,
      ),
    ).resolves.not.toThrow();

    expect(stockDecrCalls[0]!.qty).toBe(-5);
  });

  // ── Additional regression tests for the B/D defect fixes ─────────────────

  it('D: productId present with quantity=0 throws InvalidQuantityError', async () => {
    const { repo } = makeRepo();

    await expect(
      repo.approveWithExtras(
        CONSULTATION_ID,
        DOCTOR_ID,
        [{ description: '', amountUsd: 0, productId: PRODUCT_A, quantity: 0 }],
        null,
      ),
    ).rejects.toThrow(InvalidQuantityError);
  });

  it('B2: VES product with no rate in app_settings throws MissingExchangeRateError', async () => {
    const { repo } = makeRepo({
      productPriceMap: { [PRODUCT_A]: vesProduct },
      appSettingsRows: [], // no rate row
    });

    await expect(
      repo.approveWithExtras(
        CONSULTATION_ID,
        DOCTOR_ID,
        [{ description: '', amountUsd: 0, productId: PRODUCT_A, quantity: 1 }],
        null,
      ),
    ).rejects.toThrow(MissingExchangeRateError);
  });

  it('H: consultation row lock is the first query in the transaction', async () => {
    const { repo, mockQuery } = makeRepo({
      productPriceMap: { [PRODUCT_A]: usdProduct },
    });

    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: '', amountUsd: 0, productId: PRODUCT_A, quantity: 1 }],
      null,
    );

    const firstQuerySql = mockQuery.mock.calls[0]?.[0] as string;
    expect(firstQuerySql).toContain(Q_CONSULT_LOCK);
    // Base-amount read must come AFTER the lock.
    const consultLockIdx = mockQuery.mock.calls.findIndex(([sql]: [string]) =>
      sql.includes(Q_CONSULT_LOCK),
    );
    const baseAmountIdx = mockQuery.mock.calls.findIndex(([sql]: [string]) =>
      sql.includes(Q_BASE_AMOUNT),
    );
    expect(consultLockIdx).toBeLessThan(baseAmountIdx);
  });

  it('F: FOR UPDATE lock query includes doctor_id to prevent cross-tenant locks', async () => {
    const { repo, mockQuery } = makeRepo({
      oldMovements: [{ product_id: PRODUCT_A }],
      productPriceMap: { [PRODUCT_A]: usdProduct },
    });

    await repo.approveWithExtras(
      CONSULTATION_ID,
      DOCTOR_ID,
      [{ description: '', amountUsd: 0, productId: PRODUCT_A, quantity: 1 }],
      null,
    );

    const lockCall = mockQuery.mock.calls.find(([sql]: [string]) => sql.includes('FOR UPDATE'));
    expect(lockCall).toBeDefined();
    const lockOptions = lockCall![1] as { replacements?: Record<string, unknown> };
    expect(lockOptions.replacements?.['doctorId']).toBe(DOCTOR_ID);
  });
});
