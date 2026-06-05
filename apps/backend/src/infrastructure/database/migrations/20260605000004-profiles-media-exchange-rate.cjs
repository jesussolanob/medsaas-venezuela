'use strict';

/**
 * Migration: 20260605000004-profiles-media-exchange-rate
 *
 * Adds to `profiles`:
 *   - logo_url            TEXT NULL  — doctor/clinic logo URL
 *   - signature_url       TEXT NULL  — digital signature image URL
 *   - license_number      TEXT NULL  — professional medical license number
 *   - currency_mode       TEXT NULL  — 'usd_bcv' | 'eur_bcv' | 'custom' (default 'usd_bcv')
 *   - custom_rate         NUMERIC(12,4) NULL — doctor's custom exchange rate (Bs per USD/EUR)
 *   - custom_rate_label   TEXT NULL  — human-readable label for the custom rate
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('profiles', 'logo_url', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('profiles', 'signature_url', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('profiles', 'license_number', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('profiles', 'currency_mode', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: 'usd_bcv',
    });

    await queryInterface.addColumn('profiles', 'custom_rate', {
      type: Sequelize.DECIMAL(12, 4),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('profiles', 'custom_rate_label', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('profiles', 'logo_url');
    await queryInterface.removeColumn('profiles', 'signature_url');
    await queryInterface.removeColumn('profiles', 'license_number');
    await queryInterface.removeColumn('profiles', 'currency_mode');
    await queryInterface.removeColumn('profiles', 'custom_rate');
    await queryInterface.removeColumn('profiles', 'custom_rate_label');
  },
};
