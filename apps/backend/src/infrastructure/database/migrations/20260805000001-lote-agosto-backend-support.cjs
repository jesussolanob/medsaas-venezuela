'use strict';

/**
 * Migration: lote agosto — backend support columns on profiles.
 *
 * Adds two columns to the `profiles` table:
 *
 * 1. consultation_blocks_layout (TEXT NOT NULL DEFAULT 'tabs')
 *    Controls how the doctor's consultation blocks are displayed in the UI.
 *    Valid values: 'tabs' | 'vertical'. Validated in the application layer.
 *
 * 2. onboarding_completed_at (TIMESTAMPTZ NULL)
 *    Timestamp set when the doctor completes the expanded onboarding gate
 *    (≥1 active office + ≥1 active service). NULL means onboarding not yet done.
 *
 * BACKFILL (grandfathering):
 *    Existing doctors who already have a specialty are considered onboarded —
 *    they went through the original specialty-only gate. Setting
 *    onboarding_completed_at prevents them from being blocked by the new
 *    stricter gate on their next login.
 *
 * Additive only — no data loss.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add consultation_blocks_layout
    await queryInterface.addColumn('profiles', 'consultation_blocks_layout', {
      type: Sequelize.TEXT,
      allowNull: false,
      defaultValue: 'tabs',
      comment: "Display layout for consultation blocks UI. Values: 'tabs' | 'vertical'.",
    });

    // 2. Add onboarding_completed_at
    await queryInterface.addColumn('profiles', 'onboarding_completed_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
      comment:
        'Timestamp when the doctor completed the full onboarding gate (office + service). NULL = not yet completed.',
    });

    // 3. Backfill: grandfather existing doctors who already have a specialty.
    //    These doctors went through the old onboarding gate (specialty-only) and must
    //    not be blocked by the new stricter requirement on their next login.
    //    Doctors without specialty are NOT backfilled — they still need to complete onboarding.
    await queryInterface.sequelize.query(`
      UPDATE profiles
      SET onboarding_completed_at = NOW()
      WHERE onboarding_completed_at IS NULL
        AND role = 'doctor'
        AND COALESCE(specialty, '') <> ''
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('profiles', 'onboarding_completed_at');
    await queryInterface.removeColumn('profiles', 'consultation_blocks_layout');
  },
};
