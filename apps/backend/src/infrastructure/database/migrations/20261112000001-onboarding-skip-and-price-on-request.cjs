'use strict';

/**
 * Migration: 20261112000001-onboarding-skip-and-price-on-request
 *
 * Adds four new columns:
 *
 *   pricing_plans.price_on_request BOOLEAN NOT NULL DEFAULT false
 *     When true, the plan has no fixed price — the doctor quotes on request.
 *     price_usd is stored as 0 and ignored for billing purposes.
 *
 *   profiles.onboarding_last_step TEXT NULL
 *     CHECK IN ('profile','office','service','completed').
 *     Tracks how far the doctor has progressed through the onboarding wizard.
 *     NULL = never advanced past the initial state.
 *
 *   profiles.onboarding_office_skipped BOOLEAN NOT NULL DEFAULT false
 *     Set when the doctor clicked "Omitir" on the Office step and a default
 *     office was auto-created on their behalf.
 *
 *   profiles.onboarding_service_skipped BOOLEAN NOT NULL DEFAULT false
 *     Set when the doctor clicked "Omitir" on the Service step and a default
 *     price-on-request service was auto-created on their behalf.
 *
 * No backfill for existing doctors — NULL / false are correct defaults.
 * Idempotent via IF NOT EXISTS / ADD COLUMN IF NOT EXISTS guards.
 */

/** @param {import('sequelize').QueryInterface} queryInterface */
async function up(queryInterface) {
  await queryInterface.sequelize.transaction(async (t) => {
    // -----------------------------------------------------------------------
    // pricing_plans.price_on_request
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(
      `ALTER TABLE pricing_plans
         ADD COLUMN IF NOT EXISTS price_on_request BOOLEAN NOT NULL DEFAULT false`,
      { transaction: t },
    );

    // -----------------------------------------------------------------------
    // profiles.onboarding_last_step
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(
      `ALTER TABLE profiles
         ADD COLUMN IF NOT EXISTS onboarding_last_step TEXT
           CONSTRAINT chk_onboarding_last_step
           CHECK (onboarding_last_step IN ('profile', 'office', 'service', 'completed'))`,
      { transaction: t },
    );

    // -----------------------------------------------------------------------
    // profiles.onboarding_office_skipped
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(
      `ALTER TABLE profiles
         ADD COLUMN IF NOT EXISTS onboarding_office_skipped BOOLEAN NOT NULL DEFAULT false`,
      { transaction: t },
    );

    // -----------------------------------------------------------------------
    // profiles.onboarding_service_skipped
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(
      `ALTER TABLE profiles
         ADD COLUMN IF NOT EXISTS onboarding_service_skipped BOOLEAN NOT NULL DEFAULT false`,
      { transaction: t },
    );
  });
}

/** @param {import('sequelize').QueryInterface} queryInterface */
async function down(queryInterface) {
  await queryInterface.sequelize.transaction(async (t) => {
    await queryInterface.sequelize.query(
      `ALTER TABLE profiles
         DROP COLUMN IF EXISTS onboarding_service_skipped,
         DROP COLUMN IF EXISTS onboarding_office_skipped,
         DROP COLUMN IF EXISTS onboarding_last_step`,
      { transaction: t },
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE pricing_plans
         DROP COLUMN IF EXISTS price_on_request`,
      { transaction: t },
    );
  });
}

module.exports = { up, down };
