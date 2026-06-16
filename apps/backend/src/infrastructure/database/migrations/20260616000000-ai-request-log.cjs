'use strict';

/**
 * Migration: create ai_request_log table.
 *
 * Stores audit metadata for AI feature requests (transcription, etc.).
 * NEVER stores PHI: no audio, no transcript, no patient data.
 *
 * doctor_id is a soft FK to profiles.id (no formal DB constraint to avoid
 * migration ordering issues — same pattern as other audit tables in this project).
 */

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS ai_request_log (
        id          UUID          NOT NULL DEFAULT gen_random_uuid(),
        doctor_id   UUID          NOT NULL,
        feature     VARCHAR(50)   NOT NULL,
        status      VARCHAR(20)   NOT NULL,
        audio_bytes INTEGER       NOT NULL DEFAULT 0,
        model       VARCHAR(100)  NOT NULL DEFAULT '',
        created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_ai_request_log PRIMARY KEY (id)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_request_log_doctor_id
        ON ai_request_log (doctor_id);

      CREATE INDEX IF NOT EXISTS idx_ai_request_log_created_at
        ON ai_request_log (created_at);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS ai_request_log;
    `);
  },
};
