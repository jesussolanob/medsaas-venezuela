'use strict';

/**
 * Migration: 20260902000001-commission-approved-status
 *
 * Adds the intermediate 'approved' state to seller commissions.
 *
 * Before: pending → paid. The admin could pay any pending commission directly.
 * Now:    pending → approved → paid. The admin reviews a commission and enables
 *         it for payment; only approved commissions can be included in a payment.
 *
 * Two changes:
 *
 *   1. The CHECK on `status` is widened to accept 'approved'. The constraint name
 *      is DISCOVERED, not assumed: it was created inline in the CREATE TABLE, so
 *      Postgres auto-named it. This project has already had every deploy blocked
 *      by a migration that assumed a name it never verified.
 *
 *   2. `approved_at` / `approved_by` record who enabled the payment and when.
 *      Mirrors the verified_at/verified_by pair on `profiles`.
 *
 * NO BACKFILL ON PURPOSE. Rows already 'paid' were paid before this step existed,
 * so their approved_at stays NULL — inventing an approval that never happened
 * would put a lie in the audit trail. 'paid' is terminal and never re-reads it.
 * Rows still 'pending' stay pending: from now on they need an explicit approval,
 * which is the whole point of the change.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // ── 1. Widen the status CHECK ────────────────────────────────────────────
    await q.query(`
      DO $$
      DECLARE cname text;
      BEGIN
        SELECT conname INTO cname
          FROM pg_constraint
         WHERE conrelid = 'seller_commissions'::regclass
           AND contype  = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%status%';

        IF cname IS NOT NULL THEN
          EXECUTE format('ALTER TABLE seller_commissions DROP CONSTRAINT %I', cname);
        END IF;
      END $$;
    `);

    await q.query(`
      ALTER TABLE seller_commissions
        ADD CONSTRAINT seller_commissions_status_check
        CHECK (status IN ('pending', 'approved', 'paid'))
    `);

    // ── 2. Approval audit columns ────────────────────────────────────────────
    await q.query(`
      ALTER TABLE seller_commissions
        ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL
    `);

    await q.query(`
      ALTER TABLE seller_commissions
        ADD COLUMN IF NOT EXISTS approved_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Anything approved but not yet paid goes back to pending — otherwise the
    // narrowed CHECK below would fail on those rows and the rollback would die
    // halfway through.
    await q.query(`
      UPDATE seller_commissions SET status = 'pending' WHERE status = 'approved'
    `);

    await q.query(`
      ALTER TABLE seller_commissions DROP COLUMN IF EXISTS approved_by
    `);
    await q.query(`
      ALTER TABLE seller_commissions DROP COLUMN IF EXISTS approved_at
    `);

    await q.query(`
      ALTER TABLE seller_commissions
        DROP CONSTRAINT IF EXISTS seller_commissions_status_check
    `);
    await q.query(`
      ALTER TABLE seller_commissions
        ADD CONSTRAINT seller_commissions_status_check
        CHECK (status IN ('pending', 'paid'))
    `);
  },
};
