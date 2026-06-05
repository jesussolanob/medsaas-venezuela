/**
 * Migration: 20260605000003-patient-messages
 *
 * Creates the `patient_messages` table for the doctor↔patient messaging module.
 *
 * PHI column: `body` stores AES-256-GCM ciphertext (encrypted in the application
 * layer before INSERT). The plaintext body is never persisted.
 *
 * Schema decisions:
 *   - No updated_at column (messages are immutable after creation).
 *   - direction uses TEXT + CHECK constraint for forward compatibility.
 *   - Composite index on (doctor_id, patient_id, created_at) to support efficient
 *     thread queries ordered chronologically.
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`
      CREATE TABLE IF NOT EXISTS patient_messages (
        id          uuid        NOT NULL DEFAULT gen_random_uuid(),
        doctor_id   uuid        NOT NULL,
        patient_id  uuid        NOT NULL,
        body        text        NOT NULL,
        direction   text        NOT NULL
                                CHECK (direction IN ('patient_to_doctor', 'doctor_to_patient')),
        read_at     timestamptz NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CONSTRAINT fk_patient_messages_doctor
          FOREIGN KEY (doctor_id) REFERENCES profiles(id) ON DELETE CASCADE,
        CONSTRAINT fk_patient_messages_patient
          FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_patient_messages_doctor_patient
        ON patient_messages (doctor_id, patient_id, created_at)
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`DROP INDEX IF EXISTS idx_patient_messages_doctor_patient`);
    await q.query(`DROP TABLE IF EXISTS patient_messages`);
  },
};
