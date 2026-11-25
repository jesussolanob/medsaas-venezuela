'use strict';

/**
 * Add page_orientation column to doctor_templates.
 *
 * Specialists can optionally print the récipe in landscape (letter sheet split
 * in half: left = medications, right = indications). This column stores the
 * per-template preference; the default is 'portrait' (existing behaviour).
 *
 * CHECK constraint mirrors the PageOrientationValue union type in the domain.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_templates
        ADD COLUMN IF NOT EXISTS page_orientation TEXT NOT NULL DEFAULT 'portrait'
          CONSTRAINT doctor_templates_page_orientation_check
            CHECK (page_orientation IN ('portrait', 'landscape'));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE doctor_templates DROP COLUMN IF EXISTS page_orientation;
    `);
  },
};
