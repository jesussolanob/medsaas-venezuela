/**
 * Migration: 20260603000003-doctor-suggestions
 *
 * Creates the `doctor_suggestions` table for the suggestions module.
 * Doctors submit suggestions; admins review and respond to them.
 *
 * All DDL uses IF NOT EXISTS / IF EXISTS for idempotency.
 * down() drops the table cleanly.
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`
      CREATE TABLE IF NOT EXISTS doctor_suggestions (
        id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
        doctor_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        subject        text        NOT NULL,
        message        text        NOT NULL,
        category       text        NOT NULL DEFAULT 'general',
        status         text        NOT NULL DEFAULT 'pending'
                         CONSTRAINT doctor_suggestions_status_check
                         CHECK (status IN ('pending','reviewed','planned','done','rejected')),
        admin_response text        NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_suggestions_doctor_id
        ON doctor_suggestions (doctor_id)
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_suggestions_status
        ON doctor_suggestions (status)
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`DROP TABLE IF EXISTS doctor_suggestions`);
  },
};
