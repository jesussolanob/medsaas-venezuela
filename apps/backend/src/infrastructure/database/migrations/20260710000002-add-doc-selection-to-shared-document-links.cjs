'use strict';

/**
 * Adds `doc_selection` (JSONB, nullable) to `shared_document_links`.
 *
 * Stores the new doctor-facing selection of document types for the unified
 * frontend render path:
 *   {
 *     types: string[];             // ⊆ ['recipe','paraclinical','history','rest','informe']
 *     informeBlockKeys: string[];  // block keys selected within the 'informe' type
 *   }
 *
 * `sections` (the legacy boolean triple) is kept as-is for backward-compat.
 * When both are present, the frontend uses `doc_selection`; otherwise falls back
 * to `sections`.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('shared_document_links', 'doc_selection', {
      type: Sequelize.DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('shared_document_links', 'doc_selection');
  },
};
