/**
 * Migration: 20260611000005-availability-blocks
 *
 * Introduces doctor availability blocking (vacations, personal absences) and a
 * configurable booking horizon per doctor.
 *
 * Changes:
 *   1. CREATE `doctor_availability_blocks` — calendar ranges the doctor is
 *      unavailable (e.g. vacation days, out-of-office hours).
 *      A full-day block = starts_at 00:00 / ends_at 23:59:59 on that day.
 *      All timestamps stored as TIMESTAMPTZ (UTC). Clients supply America/Caracas
 *      local times; the backend converts before persisting.
 *   2. ALTER `doctor_schedules` — add `booking_horizon_weeks INT NOT NULL DEFAULT 8`
 *      (1–52). Controls how many weeks ahead the booking widget can show slots.
 *
 * down() is fully reversible.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    // ------------------------------------------------------------------
    // 1. Create doctor_availability_blocks table
    // ------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS doctor_availability_blocks (
        id          UUID        NOT NULL DEFAULT gen_random_uuid(),
        doctor_id   UUID        NOT NULL,
        starts_at   TIMESTAMPTZ NOT NULL,
        ends_at     TIMESTAMPTZ NOT NULL,
        reason      TEXT        NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT doctor_availability_blocks_pkey
          PRIMARY KEY (id),
        CONSTRAINT doctor_availability_blocks_ends_after_starts
          CHECK (ends_at > starts_at),
        CONSTRAINT fk_doctor_availability_blocks_doctor_id
          FOREIGN KEY (doctor_id)
          REFERENCES profiles(id)
          ON DELETE CASCADE
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_availability_blocks_lookup
        ON doctor_availability_blocks (doctor_id, starts_at, ends_at);
    `);

    // ------------------------------------------------------------------
    // 2. Add booking_horizon_weeks to doctor_schedules
    // ------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_schedules
        ADD COLUMN IF NOT EXISTS booking_horizon_weeks INT NOT NULL DEFAULT 8
        CONSTRAINT doctor_schedules_horizon_range
          CHECK (booking_horizon_weeks BETWEEN 1 AND 52);
    `);
  },

  async down(queryInterface) {
    // Remove booking_horizon_weeks from doctor_schedules
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_schedules
        DROP CONSTRAINT IF EXISTS doctor_schedules_horizon_range;
      ALTER TABLE doctor_schedules
        DROP COLUMN IF EXISTS booking_horizon_weeks;
    `);

    // Drop doctor_availability_blocks index + table
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_doctor_availability_blocks_lookup;
    `);

    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS doctor_availability_blocks;
    `);
  },
};
