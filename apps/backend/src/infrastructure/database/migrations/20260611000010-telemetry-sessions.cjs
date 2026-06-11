/**
 * Migration: 20260611000010-telemetry-sessions
 *
 * Replaces the `action_events` table (1 row per event) with
 * `telemetry_sessions` (1 row per session, journey stored as JSONB array).
 *
 * The `action_events` table is dropped because:
 *   1. It is replaced entirely by the new model.
 *   2. It was empty in all environments (only test data existed).
 *
 * Security notes:
 *   - doctor_id nullable (FK -> profiles ON DELETE SET NULL): sessions
 *     survive profile deletion as anonymised records.
 *   - journey is JSONB; application layer rejects PII before insert.
 *   - NEVER log journey contents at the application layer.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    // 1. Drop the old action_events table (and its indexes via CASCADE)
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS action_events CASCADE;
    `);

    // 2. Create telemetry_sessions
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS telemetry_sessions (
        id           UUID        NOT NULL DEFAULT gen_random_uuid(),
        session_id   TEXT        NOT NULL,
        doctor_id    UUID        NULL,
        journey      JSONB       NOT NULL DEFAULT '[]'::jsonb,
        event_count  INTEGER     NOT NULL DEFAULT 0,
        started_at   TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        ended_at     TIMESTAMPTZ NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT telemetry_sessions_pkey
          PRIMARY KEY (id),
        CONSTRAINT telemetry_sessions_session_id_unique
          UNIQUE (session_id),
        CONSTRAINT fk_telemetry_sessions_doctor_id
          FOREIGN KEY (doctor_id)
          REFERENCES profiles(id)
          ON DELETE SET NULL
      );
    `);

    // 3. Composite index: doctor-scoped session listing ordered by time
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_sessions_doctor_started
        ON telemetry_sessions (doctor_id, started_at DESC);
    `);
  },

  async down(queryInterface) {
    // Reverse: drop sessions, recreate action_events (minimal schema)
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_telemetry_sessions_doctor_started;
    `);

    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS telemetry_sessions CASCADE;
    `);

    // Recreate action_events with the original schema so the previous
    // migration (20260611000006-action-events) is still valid if re-run.
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS action_events (
        id            UUID        NOT NULL DEFAULT gen_random_uuid(),
        doctor_id     UUID        NULL,
        session_id    TEXT        NULL,
        action        TEXT        NOT NULL,
        resource_type TEXT        NULL,
        resource_id   TEXT        NULL,
        metadata      JSONB       NULL,
        occurred_at   TIMESTAMPTZ NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT action_events_pkey
          PRIMARY KEY (id),
        CONSTRAINT action_events_action_nonempty
          CHECK (action <> ''),
        CONSTRAINT fk_action_events_doctor_id
          FOREIGN KEY (doctor_id)
          REFERENCES profiles(id)
          ON DELETE SET NULL
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_action_events_doctor_occurred
        ON action_events (doctor_id, occurred_at DESC);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_action_events_action
        ON action_events (action);
    `);
  },
};
