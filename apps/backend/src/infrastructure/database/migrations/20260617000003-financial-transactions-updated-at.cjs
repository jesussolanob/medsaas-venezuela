'use strict';

/**
 * Migration: add updated_at column to financial_transactions.
 *
 * The table was created with updatedAt: false (only created_at).
 * Feature B (edit transactions) requires tracking last-modified time.
 * DEFAULT now() ensures historical rows get a non-null baseline value.
 */

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE financial_transactions
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE financial_transactions
        DROP COLUMN IF EXISTS updated_at;
    `);
  },
};
