'use strict';

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE appointments
        DROP COLUMN IF EXISTS duration_minutes;
    `);
  },
};
