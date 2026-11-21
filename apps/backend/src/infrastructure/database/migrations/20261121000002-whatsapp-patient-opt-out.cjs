'use strict';

/**
 * Migration: 20261121000002-whatsapp-patient-opt-out
 *
 * Adds whatsapp_opt_out BOOLEAN NOT NULL DEFAULT false to the patients table.
 *
 * When true, the patient will not receive WhatsApp appointment reminders.
 * This flag is set/cleared by the booking flow (whatsapp_reminders field in
 * the booking DTO) and is never changed programmatically by the reminder
 * dispatcher (opt-out is permanent until explicitly reversed).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE patients
       ADD COLUMN IF NOT EXISTS whatsapp_opt_out BOOLEAN NOT NULL DEFAULT false`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE patients
       DROP COLUMN IF EXISTS whatsapp_opt_out`,
    );
  },
};
