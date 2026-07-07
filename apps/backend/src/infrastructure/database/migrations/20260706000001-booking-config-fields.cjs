/**
 * Migration: 20260706000001-booking-config-fields
 *
 * Adds two booking-configuration columns to doctor_schedules:
 *   1. booking_require_reason BOOLEAN — doctor can require patients to supply
 *      a chief complaint (motivo de consulta) when booking online.
 *   2. booking_min_lead_days  INTEGER — minimum number of calendar days in
 *      advance that a public booking can be placed (0 = no restriction, max 90).
 *
 * Both columns are NOT NULL with sensible defaults so that existing rows
 * automatically adopt the "feature disabled" / "no restriction" state.
 *
 * Uses ADD COLUMN IF NOT EXISTS so the migration is safe to re-run against a DB
 * that already has the columns (e.g. idempotent in CI reset scenarios).
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    // 1. Add booking_require_reason (default false = motivo de consulta es opcional)
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_schedules
        ADD COLUMN IF NOT EXISTS booking_require_reason BOOLEAN NOT NULL DEFAULT false;
    `);

    // 2. Add booking_min_lead_days with range constraint (0–90 days)
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_schedules
        ADD COLUMN IF NOT EXISTS booking_min_lead_days INTEGER NOT NULL DEFAULT 0
        CONSTRAINT doctor_schedules_min_lead_days_range
          CHECK (booking_min_lead_days BETWEEN 0 AND 90);
    `);
  },

  async down(queryInterface) {
    // Remove booking_min_lead_days (drop constraint first, then column)
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_schedules
        DROP CONSTRAINT IF EXISTS doctor_schedules_min_lead_days_range;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_schedules
        DROP COLUMN IF EXISTS booking_min_lead_days;
    `);

    // Remove booking_require_reason
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_schedules
        DROP COLUMN IF EXISTS booking_require_reason;
    `);
  },
};
