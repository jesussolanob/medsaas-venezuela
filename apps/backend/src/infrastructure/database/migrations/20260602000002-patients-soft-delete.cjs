'use strict';

/**
 * Migration: 20260602000002-patients-soft-delete
 *
 * Adds soft-delete support to the patients table:
 *   - ADD COLUMN deleted_at TIMESTAMPTZ NULL
 *   - Creates a partial index on (doctor_id) WHERE deleted_at IS NULL for
 *     efficient queries that exclude soft-deleted rows.
 *
 * Sequelize paranoid mode uses `deleted_at` as the soft-delete column name
 * (underscored: true maps deletedAt → deleted_at automatically).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('patients', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });

    // Partial index — only active (non-deleted) patients
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_patients_active
        ON patients (doctor_id)
        WHERE deleted_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_patients_active;
    `);

    await queryInterface.removeColumn('patients', 'deleted_at');
  },
};
