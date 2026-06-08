'use strict';

/**
 * Migration: 20260608000000-profiles-auth0-sub
 *
 * Adds `auth0_sub` (TEXT, NULL) to the `profiles` table.
 *
 * This column stores the Auth0 `sub` claim (e.g. "auth0|abc123") so the backend
 * can correlate a profile with its Auth0 identity without relying solely on email.
 *
 * Also adds a unique index on auth0_sub to prevent two profiles sharing the same
 * Auth0 subject (defensive — normally 1:1).
 *
 * Notes:
 *   - profiles.email already has a unique index (idx_profiles_email) from
 *     migration 20260602000000. No new email index needed.
 *   - auth0_sub is nullable because existing profiles were created before Auth0
 *     integration. The column is back-filled on first login.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('profiles', 'auth0_sub', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Unique partial index: only enforce uniqueness for non-null values.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_profiles_auth0_sub
        ON profiles (auth0_sub)
        WHERE auth0_sub IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_profiles_auth0_sub;
    `);

    await queryInterface.removeColumn('profiles', 'auth0_sub');
  },
};
