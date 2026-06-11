/**
 * Migration: 20260611000001-profiles-verification
 *
 * Adds doctor verification workflow fields to the `profiles` table:
 *
 *   - mpps_number        TEXT NULL  — Venezuelan MPPS professional registry number
 *   - colegiado_number   TEXT NULL  — Medical college membership number
 *   - verification_status TEXT NOT NULL DEFAULT 'pending'
 *       CHECK IN ('pending','verified','rejected')
 *   - verified_at        TIMESTAMPTZ NULL
 *   - verified_by        UUID NULL  FK→ profiles.id ON DELETE SET NULL
 *
 * NOTE: cedula and license_number already exist in profiles (from the initial
 * schema). mpps_number and colegiado_number are new, separate fields.
 *
 * down() reverses all additions cleanly.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS mpps_number        TEXT,
        ADD COLUMN IF NOT EXISTS colegiado_number   TEXT,
        ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'
          CONSTRAINT profiles_verification_status_check
          CHECK (verification_status IN ('pending','verified','rejected')),
        ADD COLUMN IF NOT EXISTS verified_at        TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS verified_by        UUID
          REFERENCES profiles(id) ON DELETE SET NULL
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
        ON profiles (verification_status)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_profiles_verification_status
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        DROP COLUMN IF EXISTS verified_by,
        DROP COLUMN IF EXISTS verified_at,
        DROP COLUMN IF EXISTS verification_status,
        DROP COLUMN IF EXISTS colegiado_number,
        DROP COLUMN IF EXISTS mpps_number
    `);
  },
};
