'use strict';

/**
 * Migration: 20260908000001-quotes-manual-item-and-discount-type
 *
 * Two independent changes to the Quotes/Presupuestos module:
 *
 *   1. `quote_items.kind` widens its CHECK to accept 'manual'. Today the
 *      frontend's "Manual" button (a free-typed line with no catalog source)
 *      saves the item as 'service', so it renders with the "S" badge and is
 *      indistinguishable from a real service. The constraint was created
 *      inline in the original CREATE TABLE, so Postgres auto-named it — the
 *      name is DISCOVERED via pg_constraint, never assumed (see
 *      20260902000001-commission-approved-status for the same pattern; this
 *      project has already had a deploy blocked by a migration that guessed
 *      a constraint name it never verified).
 *
 *   2. `quotes` gains `discount_type` ('amount' | 'percent') and
 *      `discount_value` (what the specialist actually typed — 30 means
 *      "$30" for 'amount' or "30%" for 'percent'). `discount_usd` is KEPT:
 *      it becomes the computed result in dollars, still read as-is by the
 *      PDF, the public view, and the totals — nothing downstream changes.
 *
 *      BACKFILL IS MANDATORY: every existing row has a real discount_usd
 *      (a flat amount, since 'percent' did not exist before this migration).
 *      Without backfilling discount_value = discount_usd, every quote
 *      already sent would read discount_value = 0 (the column default) and
 *      show a $0 discount on a document that already went out with a real
 *      one. discount_type defaults to 'amount', which is exactly what those
 *      rows are.
 *
 * Idempotent: guarded with IF NOT EXISTS / constraint-name discovery.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // ── 1. Widen quote_items.kind CHECK to accept 'manual' ────────────────────
    await q.query(`
      DO $$
      DECLARE cname text;
      BEGIN
        SELECT conname INTO cname
          FROM pg_constraint
         WHERE conrelid = 'quote_items'::regclass
           AND contype  = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%kind%';

        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE quote_items DROP CONSTRAINT %I', cname);
        END IF;
      END $$;
    `);

    await q.query(`
      ALTER TABLE quote_items
        ADD CONSTRAINT quote_items_kind_check
        CHECK (kind IN ('service', 'product', 'manual'))
    `);

    // ── 2. quotes.discount_type / discount_value ──────────────────────────────
    await q.query(`
      ALTER TABLE quotes
        ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'amount'
          CHECK (discount_type IN ('amount', 'percent'))
    `);

    await q.query(`
      ALTER TABLE quotes
        ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12,2) NOT NULL DEFAULT 0
    `);

    // Backfill: existing rows are all flat-amount discounts (percent did not
    // exist before this migration), so discount_value = discount_usd verbatim.
    await q.query(`
      UPDATE quotes
         SET discount_type  = 'amount',
             discount_value = discount_usd
       WHERE discount_value = 0
         AND discount_usd  <> 0
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`ALTER TABLE quotes DROP COLUMN IF EXISTS discount_value`);
    await q.query(`ALTER TABLE quotes DROP COLUMN IF EXISTS discount_type`);

    // The 'kind' CHECK is intentionally left widened. Narrowing it back to
    // ('service', 'product') would require deciding what a real 'manual' row
    // becomes — reassigning it to 'service' would misrepresent a line that
    // never came from the catalog, and deleting it would destroy a quote's
    // line item. Neither is a safe default for a rollback.
  },
};
