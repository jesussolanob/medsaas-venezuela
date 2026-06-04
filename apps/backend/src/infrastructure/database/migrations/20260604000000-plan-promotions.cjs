/**
 * Migration: 20260604000000-plan-promotions
 *
 * Creates the `plan_promotions` table for the promotions module.
 * Admins manage promotion pricing for subscription plans.
 *
 * All DDL uses IF NOT EXISTS / IF EXISTS for idempotency.
 * down() drops the table cleanly.
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`
      CREATE TABLE IF NOT EXISTS plan_promotions (
        id                  uuid            PRIMARY KEY DEFAULT uuid_generate_v4(),
        plan_key            text            NOT NULL,
        duration_months     integer         NOT NULL DEFAULT 3,
        original_price_usd  numeric(10,2)   NOT NULL,
        promo_price_usd     numeric(10,2)   NOT NULL,
        label               text            NULL,
        is_active           boolean         NOT NULL DEFAULT true,
        ends_at             timestamptz     NULL,
        created_at          timestamptz     NOT NULL DEFAULT now(),
        updated_at          timestamptz     NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_plan_promotions_active
        ON plan_promotions (plan_key, is_active)
        WHERE is_active = true
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`DROP TABLE IF EXISTS plan_promotions`);
  },
};
