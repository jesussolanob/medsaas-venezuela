'use strict';

/**
 * Migration: 20261121000003-whatsapp-appointment-confirmed
 *
 * Adds patient_confirmed_at TIMESTAMPTZ NULL to the appointments table.
 *
 * Set when the patient presses the "Confirmar" quick-reply button in the
 * WhatsApp 24h reminder. Does NOT change the appointment status (the
 * specialist workflow is unaffected). NULL = not yet confirmed by patient.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE appointments
       ADD COLUMN IF NOT EXISTS patient_confirmed_at TIMESTAMPTZ NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE appointments
       DROP COLUMN IF EXISTS patient_confirmed_at`,
    );
  },
};
