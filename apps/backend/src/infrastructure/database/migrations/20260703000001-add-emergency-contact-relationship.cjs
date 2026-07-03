'use strict';

/**
 * Migration: add emergency_contact_relationship to patients table.
 *
 * Follows the same pattern as emergency_contact_name and emergency_contact_phone —
 * plain TEXT, nullable, no encryption (not PHI under the system threat model).
 *
 * Uses ADD COLUMN IF NOT EXISTS so re-running the migration is safe (idempotent).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE patients
        DROP COLUMN IF EXISTS emergency_contact_relationship;
    `);
  },
};
