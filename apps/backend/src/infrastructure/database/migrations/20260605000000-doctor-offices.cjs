/**
 * Migration: 20260605000000-doctor-offices
 *
 * Creates the `doctor_offices` table for multi-office scheduling.
 *
 * Schema:
 *   - id             uuid PK, default gen_random_uuid()
 *   - doctor_id      uuid NOT NULL, FK → profiles(id) ON DELETE CASCADE
 *   - name           text NOT NULL
 *   - address        text NOT NULL DEFAULT ''
 *   - city           text NOT NULL DEFAULT ''
 *   - phone          text DEFAULT ''
 *   - schedule       jsonb NOT NULL DEFAULT '[]'
 *                    Array of { day: int, enabled: bool, start: 'HH:MM', end: 'HH:MM' }
 *                    where day: 0=Monday … 6=Sunday (NOT JS getDay() 0=Sunday)
 *   - slot_duration  integer NOT NULL DEFAULT 30 (minutes per consultation)
 *   - buffer_minutes integer NOT NULL DEFAULT 10 (minutes between consultations)
 *   - is_active      boolean NOT NULL DEFAULT true
 *   - created_at     timestamptz NOT NULL DEFAULT now()
 *   - updated_at     timestamptz NOT NULL DEFAULT now()
 *
 * Indexes:
 *   - idx_doctor_offices_doctor ON doctor_offices(doctor_id)
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`
      CREATE TABLE IF NOT EXISTS doctor_offices (
        id             uuid        NOT NULL DEFAULT gen_random_uuid(),
        doctor_id      uuid        NOT NULL,
        name           text        NOT NULL,
        address        text        NOT NULL DEFAULT '',
        city           text        NOT NULL DEFAULT '',
        phone          text                 DEFAULT '',
        schedule       jsonb       NOT NULL DEFAULT '[]'::jsonb,
        slot_duration  integer     NOT NULL DEFAULT 30,
        buffer_minutes integer     NOT NULL DEFAULT 10,
        is_active      boolean     NOT NULL DEFAULT true,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CONSTRAINT fk_doctor_offices_doctor
          FOREIGN KEY (doctor_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_offices_doctor
        ON doctor_offices (doctor_id)
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`DROP INDEX IF EXISTS idx_doctor_offices_doctor`);
    await q.query(`DROP TABLE IF EXISTS doctor_offices`);
  },
};
