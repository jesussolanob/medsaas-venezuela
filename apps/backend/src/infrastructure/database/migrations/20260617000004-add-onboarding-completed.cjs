'use strict';

/**
 * Migration: add onboarding_completed flag to profiles.
 *
 * Replaces the fragile frontend heuristic (specialty IS NOT NULL) with an
 * explicit server-side boolean. The flag is set to true by
 * CompleteRegistrationUseCase when the doctor submits the onboarding form.
 *
 * Backfill: doctors who already completed onboarding (specialty present AND
 * cedula present) are marked true so they are not incorrectly redirected.
 */

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;
    `);

    await queryInterface.sequelize.query(`
      UPDATE profiles
         SET onboarding_completed = true
       WHERE specialty IS NOT NULL
         AND trim(specialty) <> ''
         AND cedula IS NOT NULL
         AND trim(cedula) <> '';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        DROP COLUMN IF EXISTS onboarding_completed;
    `);
  },
};
