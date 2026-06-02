/**
 * Migration: 20260602000003-consultations-payment-date-and-code-unique
 *
 * Adds:
 *   1. payment_date column (timestamptz, nullable) to consultations.
 *
 * consultation_code UNIQUE constraint already exists in the initial schema
 * (post-review correction G in 20260602000000). This migration adds only
 * what is genuinely missing from the live schema.
 *
 * Spec: migracion/03b-schema-real.md T-07
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add payment_date column
    await queryInterface.addColumn('consultations', 'payment_date', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.removeColumn('consultations', 'payment_date');
  },
};
