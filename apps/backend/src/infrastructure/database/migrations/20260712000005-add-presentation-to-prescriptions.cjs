'use strict';

/**
 * Migration: 20260712000005-add-presentation-to-prescriptions
 *
 * Adds the `presentation` column to the `prescriptions` table.
 * Stores the pharmaceutical form of the medication in plaintext
 * (e.g. 'tabletas', 'gotas', 'spray', 'cápsulas').
 *
 * This field is NOT PHI — no encryption required.
 * It is nullable and optional; existing rows default to NULL.
 *
 * down(): removes the column.
 */

const { DataTypes } = require('sequelize');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('prescriptions', 'presentation', {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('prescriptions', 'presentation');
  },
};
