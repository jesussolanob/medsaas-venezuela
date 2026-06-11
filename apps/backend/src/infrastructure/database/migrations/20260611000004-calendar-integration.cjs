/**
 * Migration: 20260611000004-calendar-integration
 *
 * Introduces per-office modality, meet_link on appointments, and the
 * google_integrations table for the Google Calendar/Meet opt-in feature.
 *
 * Changes:
 *   1. ALTER doctor_offices  — add `modality` TEXT NOT NULL DEFAULT 'in_person'
 *        CHECK ('in_person','online','both').
 *   2. ALTER appointments    — add `meet_link` TEXT NULL.
 *   3. CREATE google_integrations
 *        id uuid PK, doctor_id uuid UNIQUE FK→profiles(id) ON DELETE CASCADE,
 *        access_token_encrypted TEXT, refresh_token_encrypted TEXT,
 *        token_expiry TIMESTAMPTZ, scope TEXT, google_email TEXT,
 *        connected_at TIMESTAMPTZ, updated_at TIMESTAMPTZ.
 *        Tokens are stored AES-256-GCM encrypted via shared-crypto.
 *
 * down() is fully reversible.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    // ------------------------------------------------------------------
    // 1. Add modality column to doctor_offices
    // ------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_offices
        ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'in_person'
        CONSTRAINT doctor_offices_modality_check
          CHECK (modality IN ('in_person', 'online', 'both'));
    `);

    // ------------------------------------------------------------------
    // 2. Add meet_link column to appointments
    // ------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS meet_link TEXT NULL;
    `);

    // ------------------------------------------------------------------
    // 3. Create google_integrations table
    // ------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS google_integrations (
        id                       UUID        NOT NULL DEFAULT gen_random_uuid(),
        doctor_id                UUID        NOT NULL,
        access_token_encrypted   TEXT        NOT NULL,
        refresh_token_encrypted  TEXT        NOT NULL,
        token_expiry             TIMESTAMPTZ NULL,
        scope                    TEXT        NULL,
        google_email             TEXT        NULL,
        connected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT google_integrations_pkey         PRIMARY KEY (id),
        CONSTRAINT google_integrations_doctor_id_uq UNIQUE (doctor_id),
        CONSTRAINT fk_google_integrations_doctor_id
          FOREIGN KEY (doctor_id)
          REFERENCES profiles(id)
          ON DELETE CASCADE
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_google_integrations_doctor_id
        ON google_integrations (doctor_id);
    `);
  },

  async down(queryInterface) {
    // Drop google_integrations index + table
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_google_integrations_doctor_id;
    `);

    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS google_integrations;
    `);

    // Remove meet_link from appointments
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
        DROP COLUMN IF EXISTS meet_link;
    `);

    // Remove modality from doctor_offices
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_offices
        DROP CONSTRAINT IF EXISTS doctor_offices_modality_check;
      ALTER TABLE doctor_offices
        DROP COLUMN IF EXISTS modality;
    `);
  },
};
