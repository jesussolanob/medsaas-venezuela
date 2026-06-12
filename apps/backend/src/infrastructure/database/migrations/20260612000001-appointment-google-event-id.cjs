'use strict';

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS google_calendar_event_id TEXT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
        DROP COLUMN IF EXISTS google_calendar_event_id;
    `);
  },
};
