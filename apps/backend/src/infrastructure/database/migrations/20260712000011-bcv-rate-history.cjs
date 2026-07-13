'use strict';

/**
 * Migration: create bcv_rate_history table
 *
 * Stores one BCV USD/VES rate per calendar day, used as a cache so the
 * /api/settings/bcv-rate?date= endpoint can return historical rates without
 * hitting external APIs every request.
 *
 * rate_date is the PRIMARY KEY so there is exactly one row per day (upsert safe).
 * source tracks where the rate was fetched from (e.g. 'pydolarve', 've.dolarapi').
 */

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bcv_rate_history', {
      rate_date: {
        type: Sequelize.DATEONLY,
        primaryKey: true,
        allowNull: false,
      },
      rate: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
      },
      source: {
        type: Sequelize.STRING(40),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bcv_rate_history');
  },
};
