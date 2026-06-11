/**
 * Migration: 20260611000006-action-events
 *
 * Introduces the `action_events` table for doctor action telemetry.
 * Stores UI events (module visits, button clicks) sent in batches by the
 * frontend for error-path reconstruction and usage analytics.
 *
 * Security notes:
 *   - doctor_id is nullable (FK → profiles ON DELETE SET NULL) so events
 *     survive profile deletion as anonymised records.
 *   - metadata is JSONB but the application layer rejects PII before insert.
 *   - NEVER log metadata contents at the application layer.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
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

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_action_events_action;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_action_events_doctor_occurred;
    `);

    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS action_events;
    `);
  },
};
