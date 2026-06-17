'use strict';

/**
 * Migration: create income_concepts table and add concept_id to financial_transactions.
 *
 * income_concepts holds doctor-scoped editable income labels.
 * concept_id on financial_transactions is nullable so existing income rows are unaffected.
 */

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS income_concepts (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        doctor_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name         TEXT        NOT NULL,
        is_active    BOOLEAN     NOT NULL DEFAULT true,
        sort_order   INT         NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_income_concepts_doctor_id
        ON income_concepts (doctor_id);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE financial_transactions
        ADD COLUMN IF NOT EXISTS concept_id UUID NULL
          REFERENCES income_concepts(id) ON DELETE SET NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE financial_transactions
        DROP COLUMN IF EXISTS concept_id;
    `);

    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS income_concepts;
    `);
  },
};
