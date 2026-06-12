/**
 * Migration: 20260612000002-profiles-last-sign-in-at
 *
 * Adds last_sign_in_at column to the profiles table.
 * Used by the login-touch mechanism to track when each user last authenticated.
 * Nullable: existing rows and users who have never logged in via the backend
 * endpoint will have NULL until their first login touch.
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ NULL
    `);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        DROP COLUMN IF EXISTS last_sign_in_at
    `);
  },
};
