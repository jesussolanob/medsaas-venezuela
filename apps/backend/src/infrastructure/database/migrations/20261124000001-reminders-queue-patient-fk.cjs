'use strict';

/**
 * reminders_queue.patient_id pointed to profiles(id) (inherited from the initial
 * Supabase schema). 20260605000002-reminders meant to point it to patients(id)
 * but the table already existed, so that FK never applied.
 *
 * Every dispatcher inserts appointments.patient_id (a patients.id), so every
 * insert failed the FK: the queue has 0 rows in production and NO appointment
 * reminder (email or WhatsApp) was ever sent. This repoints the FK to patients.
 *
 * Rows whose patient_id is not a patient are nulled first (none expected).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE reminders_queue DROP CONSTRAINT IF EXISTS reminders_queue_patient_id_fkey;
    `);
    await queryInterface.sequelize.query(`
      UPDATE reminders_queue rq SET patient_id = NULL
       WHERE patient_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM patients p WHERE p.id = rq.patient_id);
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE reminders_queue
        ADD CONSTRAINT reminders_queue_patient_id_fkey
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE reminders_queue DROP CONSTRAINT IF EXISTS reminders_queue_patient_id_fkey;
    `);
    await queryInterface.sequelize.query(`
      UPDATE reminders_queue rq SET patient_id = NULL
       WHERE patient_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = rq.patient_id);
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE reminders_queue
        ADD CONSTRAINT reminders_queue_patient_id_fkey
        FOREIGN KEY (patient_id) REFERENCES profiles(id);
    `);
  },
};
