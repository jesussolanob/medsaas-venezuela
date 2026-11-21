'use strict';

/**
 * Migration: 20261121000001-whatsapp-reminders-columns
 *
 * Prepares reminders_queue for WhatsApp channel support:
 *
 * 1. Drop the existing UNIQUE(appointment_id, offset_type) constraint and
 *    replace it with UNIQUE(appointment_id, offset_type, channel).
 *    This allows one email row AND one whatsapp row per appointment per
 *    offset_type, while still preventing duplicates within the same channel.
 *
 * 2. Add external_message_id  TEXT NULL — Zernio messageId returned on send.
 * 3. Add external_conversation_id TEXT NULL — Zernio conversationId for replies.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    // 1. Drop old constraint and add the new one including channel.
    //    The column `channel` already exists (added in 20260605000002-reminders.cjs).
    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       DROP CONSTRAINT IF EXISTS ux_reminders_queue_appt_offset`,
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       ADD CONSTRAINT ux_reminders_queue_appt_offset_channel
       UNIQUE (appointment_id, offset_type, channel)`,
    );

    // 2. Add external_message_id column.
    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       ADD COLUMN IF NOT EXISTS external_message_id TEXT NULL`,
    );

    // 3. Add external_conversation_id column.
    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       ADD COLUMN IF NOT EXISTS external_conversation_id TEXT NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       DROP COLUMN IF EXISTS external_conversation_id`,
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       DROP COLUMN IF EXISTS external_message_id`,
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       DROP CONSTRAINT IF EXISTS ux_reminders_queue_appt_offset_channel`,
    );

    // Restore the old single-channel unique constraint (best-effort — may fail
    // if duplicate rows were inserted in the interim; acceptable for rollback).
    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       ADD CONSTRAINT ux_reminders_queue_appt_offset
       UNIQUE (appointment_id, offset_type)`,
    );
  },
};
