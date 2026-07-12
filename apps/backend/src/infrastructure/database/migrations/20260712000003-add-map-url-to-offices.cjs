'use strict';

/**
 * Migration: 20260712000003-add-map-url-to-offices
 *
 * Adds an optional `map_url` column to `doctor_offices`.
 * Stores an http/https URL pointing to the office location on Google Maps
 * (or any other map service). Used in appointment confirmation emails to
 * render a "Ver ubicación en el mapa" button for patients.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('doctor_offices', 'map_url', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('doctor_offices', 'map_url');
  },
};
