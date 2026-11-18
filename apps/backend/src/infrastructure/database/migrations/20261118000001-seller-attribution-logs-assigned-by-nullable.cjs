'use strict';

/**
 * Migration: 20261118000001-seller-attribution-logs-assigned-by-nullable
 *
 * Makes `seller_attribution_logs.assigned_by` nullable.
 *
 * Background:
 *   The original migration (20260828000001) defined assigned_by as NOT NULL
 *   REFERENCES profiles(id). That design assumed only humans (admin users)
 *   ever re-assign sellers. The new "default seller" feature needs the system
 *   itself to write attribution rows during organic onboarding, with no human
 *   actor to reference. NULL = "system-initiated assignment".
 *
 * This migration is idempotent: the column is already nullable if it has been
 * applied, so a second run is a no-op at the Postgres level (ALTER COLUMN on a
 * column that is already nullable has no effect).
 *
 * Rows inserted by the system will have assigned_by = NULL.
 * Rows inserted by admin re-assignments keep their non-null value.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_attribution_logs
        ALTER COLUMN assigned_by DROP NOT NULL
    `);
  },

  async down(queryInterface) {
    // Restore the NOT NULL constraint.
    // WARNING: this will fail if any rows currently have assigned_by = NULL.
    // Before running down(), manually set assigned_by on those rows or delete them.
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_attribution_logs
        ALTER COLUMN assigned_by SET NOT NULL
    `);
  },
};
