'use strict';

/**
 * Migration: add birth_date column to profiles table.
 *
 * Adds a nullable DATE column so doctors can optionally store their date of birth.
 * The cedula column already exists in the table (added in an earlier migration);
 * this file only adds birth_date.
 */

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS birth_date DATE NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        DROP COLUMN IF EXISTS birth_date;
    `);
  },
};
