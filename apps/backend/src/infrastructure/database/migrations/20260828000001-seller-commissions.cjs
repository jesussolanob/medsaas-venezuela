'use strict';

/**
 * Migration: 20260828000001-seller-commissions
 *
 * Introduces the commission tracking system for sellers.
 *
 * This migration creates four changes:
 *
 *   1. `seller_commissions` — one row per commission event.
 *      UNIQUE(specialist_id, type) guarantees at-most-one signup and at-most-one
 *      plan commission per specialist, enforced at the DB level (not just the use case).
 *
 *   2. `seller_payments` — records when an admin registers a cash-out for a seller,
 *      linking to the specific commissions included in that payment.
 *
 *   3. `seller_attribution_logs` — audit log for admin-initiated specialist
 *      re-assignments. Captures who made the change, when, and what the previous
 *      seller was (for dispute resolution).
 *
 *   4. `profiles.sold_by_source` TEXT NULL — distinguishes attribution by seller
 *      code ('code'), by the seller loading the specialist by hand
 *      ('seller_manual'), and by admin assignment of a lead ('admin').
 *      NOT a Postgres ENUM: this project has had two production outages from ENUM
 *      values missing from the DB while present in code. TEXT + validation in Zod.
 *
 *   5. `plan_prices.compare_at_price` NUMERIC NULL — a "crossed out" reference price
 *      per plan/period, editable from admin. NULL = no promotional display.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // ── 1. seller_payments (must be created before seller_commissions for the FK) ─
    await q.query(`
      CREATE TABLE IF NOT EXISTS seller_payments (
        id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        seller_id     UUID         NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        amount_usd    NUMERIC(10,2) NOT NULL,
        method        TEXT         NOT NULL,
        reference     TEXT         NOT NULL,
        receipt_url   TEXT         NULL,
        notes         TEXT         NULL,
        paid_at       TIMESTAMPTZ  NOT NULL,
        created_by    UUID         NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_seller_payments_seller_id
        ON seller_payments (seller_id)
    `);

    // ── 2. seller_commissions ─────────────────────────────────────────────────
    //   UNIQUE(specialist_id, type): guarantees the "one signup, one plan" rule
    //   at the database level, even under concurrent requests.
    await q.query(`
      CREATE TABLE IF NOT EXISTS seller_commissions (
        id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
        seller_id     UUID          NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        specialist_id UUID          NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        type          TEXT          NOT NULL CHECK (type IN ('signup', 'plan')),
        amount_usd    NUMERIC(10,2) NOT NULL,
        plan_key      TEXT          NULL,
        status        TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
        earned_at     TIMESTAMPTZ   NOT NULL,
        payment_id    UUID          NULL REFERENCES seller_payments(id) ON DELETE SET NULL,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_seller_commissions_specialist_type UNIQUE (specialist_id, type)
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_seller_commissions_seller_status
        ON seller_commissions (seller_id, status)
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_seller_commissions_specialist_id
        ON seller_commissions (specialist_id)
    `);

    // ── 3. seller_attribution_logs ────────────────────────────────────────────
    //   Admin re-assignment audit trail. from_seller_id can be NULL when the
    //   specialist had no prior seller before the first admin assignment.
    await q.query(`
      CREATE TABLE IF NOT EXISTS seller_attribution_logs (
        id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
        specialist_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        from_seller_id UUID        NULL     REFERENCES profiles(id) ON DELETE SET NULL,
        to_seller_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        assigned_by    UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        assigned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_seller_attribution_logs_specialist_id
        ON seller_attribution_logs (specialist_id)
    `);

    // ── 4. profiles.sold_by_source ────────────────────────────────────────────
    //   'code'          = specialist typed a seller code during self-onboarding.
    //   'seller_manual' = the seller loaded the specialist by hand from their portal.
    //   'admin'         = a super_admin assigned the specialist to a seller (lead
    //                     from Ads or direct). Earns NO signup commission.
    //   NULL            = the specialist was not attributed to any seller.
    //   TEXT (not ENUM) — see migration comment above for rationale.
    await q.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS sold_by_source TEXT NULL
    `);

    // Back-fill: all existing attributed rows came from the code path
    // (the admin assignment feature did not exist before this migration).
    await q.query(`
      UPDATE profiles
         SET sold_by_source = 'code'
       WHERE sold_by IS NOT NULL
         AND sold_by_source IS NULL
    `);

    // ── 5. plan_prices.compare_at_price ──────────────────────────────────────
    //   A reference "crossed out" price shown in the pricing UI.
    //   NULL = no promotional display for that period.
    //   Verified against plan_prices schema: the table has (id, plan_key, period,
    //   price_usd, is_active, created_at, updated_at) — compare_at_price is new.
    await q.query(`
      ALTER TABLE plan_prices
        ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(10,2) NULL
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Remove plan_prices column first (no dependencies).
    await q.query(`
      ALTER TABLE plan_prices
        DROP COLUMN IF EXISTS compare_at_price
    `);

    // Remove profiles column.
    await q.query(`
      ALTER TABLE profiles
        DROP COLUMN IF EXISTS sold_by_source
    `);

    // Remove commission tables in dependency order.
    await q.query(`DROP TABLE IF EXISTS seller_attribution_logs`);
    await q.query(`DROP TABLE IF EXISTS seller_commissions`);
    await q.query(`DROP TABLE IF EXISTS seller_payments`);
  },
};
