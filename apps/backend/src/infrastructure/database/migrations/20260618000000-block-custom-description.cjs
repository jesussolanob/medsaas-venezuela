'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_consultation_blocks
        ADD COLUMN IF NOT EXISTS custom_description TEXT NULL
    `);
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_consultation_blocks
        DROP COLUMN IF EXISTS custom_description
    `);
  },
};
