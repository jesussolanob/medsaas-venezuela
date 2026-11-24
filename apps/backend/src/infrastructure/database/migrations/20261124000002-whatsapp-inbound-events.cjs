'use strict';

/**
 * whatsapp_inbound_events — one row per Zernio message.received handled.
 *
 * Zernio retries a delivery when the 2xx doesn't arrive within 5 s (e.g. a cold
 * Cloud Run start). The handler kept processed ids in memory, so a retry landing
 * on a fresh instance replied twice ("¡Gracias!" x2). Claiming the message id
 * here makes the dedupe hold across instances and restarts.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_inbound_events (
        message_id  TEXT        PRIMARY KEY,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS whatsapp_inbound_events;`);
  },
};
