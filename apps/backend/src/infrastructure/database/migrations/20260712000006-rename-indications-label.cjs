'use strict';

/**
 * Migration: 20260712000006-rename-indications-label
 *
 * Renames the consultation block label for key 'indications':
 *   'Indicaciones' → 'Evaluación actual'
 *
 * The key itself is NOT changed to preserve existing consultation data.
 * Only the human-readable default_label shown in the UI is updated.
 *
 * Idempotent: the WHERE clause matches only the old label, so re-running
 * after the label has already been updated is a no-op.
 *
 * down(): reverts to 'Indicaciones'.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`
      UPDATE consultation_block_catalog
         SET default_label = 'Evaluación actual'
       WHERE key           = 'indications'
         AND default_label = 'Indicaciones'
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`
      UPDATE consultation_block_catalog
         SET default_label = 'Indicaciones'
       WHERE key           = 'indications'
         AND default_label = 'Evaluación actual'
    `);
  },
};
