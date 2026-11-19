'use strict';

/**
 * Migration: 20261118000010-seller-specialist-activities
 *
 * Creates the `seller_specialist_activities` table for the seller commercial
 * follow-up workflow ("gestión de especialistas").
 *
 * Schema design notes:
 *
 * - `type` is TEXT + CHECK (not a Postgres ENUM): the project has had three
 *   production outages from ENUM values missing in the DB (ADR note in CLAUDE.md).
 *   TEXT + CHECK gives the same constraint without ALTER TYPE DDL pain.
 *
 * - `to_status` is TEXT + CHECK for the same reason. 'sin_contactar' is the
 *   implicit default (computed, never stored): rows with no status_change entry
 *   mean the specialist has not been contacted yet.
 *
 * - The row-level CHECK at the bottom enforces two invariants:
 *     status_change rows must have to_status set.
 *     comment rows must have a non-empty comment.
 *
 * - `comment` length is capped at 2000 characters in both the CHECK constraint
 *   and the Zod schema.
 *
 * - Idempotent: uses CREATE TABLE IF NOT EXISTS and IF NOT EXISTS for the index.
 *   Running this migration a second time is safe.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS seller_specialist_activities (
        id            UUID          NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
        specialist_id UUID          NOT NULL REFERENCES profiles(id),
        seller_id     UUID          NOT NULL REFERENCES profiles(id),
        type          TEXT          NOT NULL
                        CHECK (type IN ('status_change', 'comment')),
        from_status   TEXT
                        CHECK (from_status IS NULL OR from_status IN (
                          'primer_contacto', 'no_atendio', 'completar_onboarding',
                          'induccion', 'reactivar', 'desistido'
                        )),
        to_status     TEXT
                        CHECK (to_status IS NULL OR to_status IN (
                          'primer_contacto', 'no_atendio', 'completar_onboarding',
                          'induccion', 'reactivar', 'desistido'
                        )),
        comment       TEXT
                        CHECK (comment IS NULL OR (
                          length(trim(comment)) > 0 AND length(comment) <= 2000
                        )),
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT seller_specialist_activities_type_invariant CHECK (
          (type = 'status_change' AND to_status IS NOT NULL)
          OR (type = 'comment' AND comment IS NOT NULL AND length(trim(comment)) > 0)
        )
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_seller_specialist_activities_specialist
        ON seller_specialist_activities (specialist_id, created_at DESC)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS seller_specialist_activities`,
    );
  },
};
