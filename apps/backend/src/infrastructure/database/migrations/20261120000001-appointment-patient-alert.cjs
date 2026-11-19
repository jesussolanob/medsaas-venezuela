'use strict';

/**
 * Migration: 20261120000001-appointment-patient-alert
 *
 * Adds patient_alert TEXT NULL to the appointments table.
 *
 * This field stores the optional health note the patient submits during
 * public booking: "¿Algo que tu especialista deba saber? (alergias,
 * condiciones, medicamentos que tomas)". Max 500 chars is enforced at the
 * application layer (Zod DTO); the column is unbounded TEXT so it can hold
 * any content that passes validation.
 *
 * The same text is also merged into patients.allergies (a separate column
 * that already exists) by the create-booking use case — no schema change
 * needed on the patients side.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS patient_alert TEXT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
        DROP COLUMN IF EXISTS patient_alert;
    `);
  },
};
