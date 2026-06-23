'use strict';

/**
 * Migration: add patient_id to financial_transactions.
 *
 * For income entries linked to a consultation the patient_id is derived at
 * the application layer from the consultation row (never trusted from the
 * request body). For income entries NOT linked to a consultation the doctor
 * may optionally supply a patient_id (validated for ownership before persist).
 * Expense-type rows always have patient_id = NULL.
 *
 * ON DELETE SET NULL: if a patient record is hard-deleted the income row is
 * kept (it is a financial audit record) but the patient link is cleared.
 */

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE financial_transactions
        ADD COLUMN IF NOT EXISTS patient_id UUID NULL
          REFERENCES patients(id) ON DELETE SET NULL;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_financial_transactions_patient_id
        ON financial_transactions (patient_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_financial_transactions_patient_id;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE financial_transactions
        DROP COLUMN IF EXISTS patient_id;
    `);
  },
};
