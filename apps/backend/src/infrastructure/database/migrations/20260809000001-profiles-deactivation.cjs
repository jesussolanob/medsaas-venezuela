'use strict';

/**
 * Migration: 20260809000001-profiles-deactivation
 *
 * Lets a specialist deactivate their own account from Configuración, while
 * keeping every row intact so the history stays auditable and a super_admin can
 * switch the account back on later.
 *
 * The ON/OFF switch itself is the pre-existing `profiles.is_active` flag — it is
 * already enforced by AppAuthGuard (403 ACCOUNT_BLOCKED) and by the public
 * booking flow, so deactivation reuses that machinery instead of adding a second
 * parallel one. What was missing is WHY the account is off: an admin ban and a
 * voluntary exit look identical when all you have is `is_active = false`.
 *
 * Three columns record that provenance:
 *
 *   deactivated_at        TIMESTAMPTZ NULL
 *     When the account was switched off. NULL means the account is live.
 *
 *   deactivated_by        TEXT NULL — 'self' | 'admin'
 *     'self'  → the specialist deactivated their own account.
 *     'admin' → a super_admin banned it.
 *     Drives the user-facing copy (a voluntary exit must not read as a sanction)
 *     and tells the admin what they are reactivating.
 *
 *   deactivation_reason   TEXT NULL
 *     Optional free text supplied by whoever performed the action.
 *
 * NOT NULL is deliberately avoided: existing rows are live accounts, and a live
 * account is exactly the state these three columns represent as NULL.
 *
 * Backfill: profiles already blocked by an admin (is_active = false) predate the
 * self-service path, so they are stamped 'admin'. Without this they would show
 * as "deactivated by nobody" in the admin panel.
 *
 * No index, constraint or unique key is touched — nothing here can break an
 * existing write path. Fully reversible.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    // 1. Provenance columns for the is_active switch.
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS deactivated_at      TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS deactivated_by      TEXT        NULL,
        ADD COLUMN IF NOT EXISTS deactivation_reason TEXT        NULL
    `);

    // 2. Guard the vocabulary at the database level so a typo cannot invent a
    //    third origin that the UI does not know how to render.
    //    DROP first: ADD CONSTRAINT has no IF NOT EXISTS, and this migration
    //    must stay safe to re-run.
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        DROP CONSTRAINT IF EXISTS profiles_deactivated_by_check
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        ADD CONSTRAINT profiles_deactivated_by_check
        CHECK (deactivated_by IS NULL OR deactivated_by IN ('self', 'admin'))
    `);

    // 3. Backfill accounts already switched off before this migration existed.
    //    Only admins could turn an account off until now, so 'admin' is correct.
    //    deactivated_at is unknowable retroactively — left NULL on purpose
    //    rather than invented from now().
    await queryInterface.sequelize.query(`
      UPDATE profiles
         SET deactivated_by = 'admin'
       WHERE is_active = false
         AND deactivated_by IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        DROP CONSTRAINT IF EXISTS profiles_deactivated_by_check
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        DROP COLUMN IF EXISTS deactivated_at,
        DROP COLUMN IF EXISTS deactivated_by,
        DROP COLUMN IF EXISTS deactivation_reason
    `);
  },
};
