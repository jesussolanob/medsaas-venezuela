/**
 * Migration: 20260712000013-financial-transactions-expense-concept
 *
 * Adds the `expense_concept` column to `financial_transactions` so that
 * expense entries can be classified into one of six fixed categories:
 *   rent | staff | supplies | services | taxes | other
 *
 * The column is nullable (VARCHAR 40) so that existing expense rows are
 * unaffected (they retain NULL and are surfaced as 'other' in breakdowns).
 * Income rows always have NULL in this column.
 *
 * updated_at was added in migration 20260617000003 — confirmed present.
 *
 * down(): drops the column (idempotent via IF EXISTS).
 *
 * @type {import('sequelize-cli').Migration}
 */

'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE financial_transactions
        ADD COLUMN IF NOT EXISTS expense_concept VARCHAR(40) NULL;
    `);

    // Optional CHECK constraint to enforce the allowed enum values at DB level.
    // The constraint is only added when it does not already exist (idempotent).
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'financial_transactions_expense_concept_check'
        ) THEN
          ALTER TABLE financial_transactions
            ADD CONSTRAINT financial_transactions_expense_concept_check
            CHECK (
              expense_concept IS NULL
              OR expense_concept IN ('rent','staff','supplies','services','taxes','other')
            );
        END IF;
      END;
      $$;
    `);
  },

  async down(queryInterface) {
    // Drop the constraint first, then the column.
    await queryInterface.sequelize.query(`
      ALTER TABLE financial_transactions
        DROP CONSTRAINT IF EXISTS financial_transactions_expense_concept_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE financial_transactions
        DROP COLUMN IF EXISTS expense_concept;
    `);
  },
};
