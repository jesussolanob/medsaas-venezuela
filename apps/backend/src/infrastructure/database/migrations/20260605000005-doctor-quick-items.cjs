/**
 * Migration: 20260605000005-doctor-quick-items
 *
 * Creates the `doctor_quick_items` table for doctor shortcut items
 * (quick exams and medications) used during consultations.
 *
 * Schema:
 *   - id          uuid PK, default gen_random_uuid()
 *   - doctor_id   uuid NOT NULL, FK → profiles(id) ON DELETE CASCADE
 *   - item_type   text NOT NULL, CHECK IN ('exam', 'medication')
 *   - name        text NOT NULL (display label for the item)
 *   - category    text NULL (optional grouping / speciality category)
 *   - details     text NULL (optional extra info: dose, instructions, etc.)
 *   - created_at  timestamptz NOT NULL DEFAULT now()
 *
 * Indexes:
 *   - idx_doctor_quick_items_doctor_type ON doctor_quick_items(doctor_id, item_type)
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`
      CREATE TABLE IF NOT EXISTS doctor_quick_items (
        id          uuid        NOT NULL DEFAULT gen_random_uuid(),
        doctor_id   uuid        NOT NULL,
        item_type   text        NOT NULL CHECK (item_type IN ('exam', 'medication')),
        name        text        NOT NULL,
        category    text,
        details     text,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CONSTRAINT fk_doctor_quick_items_doctor
          FOREIGN KEY (doctor_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_quick_items_doctor_type
        ON doctor_quick_items (doctor_id, item_type)
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`DROP INDEX IF EXISTS idx_doctor_quick_items_doctor_type`);
    await q.query(`DROP TABLE IF EXISTS doctor_quick_items`);
  },
};
