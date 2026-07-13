'use strict';

/**
 * Migration: add blocks_structure JSONB column to consultations.
 *
 * blocks_structure stores the per-consultation block array (structure definitions)
 * separately from blocks_snapshot which stores block values (key→value record).
 *
 * Keeping them separate eliminates the ambiguity that caused the DTO rejection:
 *   - blocks_snapshot: z.record(...)  — values only
 *   - blocks_structure: z.array(...)  — structure definitions only
 *
 * Additive only: no data migration, blocks_snapshot is untouched.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('consultations', 'blocks_structure', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Per-consultation block structure (array of block definitions). Values live in blocks_snapshot.',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('consultations', 'blocks_structure');
  },
};
