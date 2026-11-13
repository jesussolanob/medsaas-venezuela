'use strict';

/**
 * Migration: 20261030000002-release-notes
 *
 * Phase 2 of the specialist-retention plan — "Novedades de versión".
 *
 * CREATES:
 *   - `release_notes` table: stores product release notes.
 *   - Index on (published_at DESC) WHERE published_at IS NOT NULL.
 *
 * ALTERS:
 *   - `profiles` ADD COLUMN IF NOT EXISTS release_notes_seen_at TIMESTAMPTZ NULL.
 *
 * NOTES:
 *   - Postgres has NO ADD CONSTRAINT IF NOT EXISTS. Inline CHECK constraints in
 *     CREATE TABLE IF NOT EXISTS are fine (idempotent on re-run).
 *   - ARRAY type for audience_plans requires no special Postgres extension.
 *   - The partial index on published_at improves the doctor unseen query.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) =>
        queryInterface.sequelize.query(sql, { transaction, ...opts });

      // ------------------------------------------------------------------
      // 1. release_notes table
      // ------------------------------------------------------------------
      await q(`
        CREATE TABLE IF NOT EXISTS release_notes (
          id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          title           TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
          body            TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1500),
          image_url       TEXT        NULL
                              CHECK (image_url IS NULL OR image_url LIKE 'logo/%'),
          audience_plans  TEXT[]      NULL,
          published_at    TIMESTAMPTZ NULL,
          created_by      UUID        NULL REFERENCES profiles(id) ON DELETE SET NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // ------------------------------------------------------------------
      // 2. Index: fast lookup of published notes (newest first)
      // ------------------------------------------------------------------
      await q(`
        CREATE INDEX IF NOT EXISTS release_notes_published_at_idx
          ON release_notes (published_at DESC)
         WHERE published_at IS NOT NULL
      `);

      // ------------------------------------------------------------------
      // 3. Add release_notes_seen_at to profiles (idempotent)
      // ------------------------------------------------------------------
      await q(`
        ALTER TABLE profiles
          ADD COLUMN IF NOT EXISTS release_notes_seen_at TIMESTAMPTZ NULL
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      // Remove the column added to profiles
      await q(`
        ALTER TABLE profiles
          DROP COLUMN IF EXISTS release_notes_seen_at
      `);

      // Drop index then table
      await q(`DROP INDEX IF EXISTS release_notes_published_at_idx`);
      await q(`DROP TABLE IF EXISTS release_notes`);
    });
  },
};
