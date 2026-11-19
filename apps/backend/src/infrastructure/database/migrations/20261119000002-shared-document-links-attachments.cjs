'use strict';

/**
 * Migration: 20261119000002-shared-document-links-attachments
 *
 * Adds a nullable JSONB `attachments` column to `shared_document_links`.
 *
 * Shape persisted (snapshot at share time):
 * ```json
 * [
 *   {
 *     "name": "Hoja de tareas terapéuticas.pdf",
 *     "storagePath": "document/doctor-uuid/ts-filename.pdf",
 *     "mimeType": "application/pdf",
 *     "sizeBytes": 204800,
 *     "source": "library",
 *     "libraryFileId": "uuid"
 *   },
 *   {
 *     "name": "resultados.png",
 *     "storagePath": "document/doctor-uuid/ts-resultados.png",
 *     "mimeType": "image/png",
 *     "sizeBytes": 51200,
 *     "source": "upload"
 *   }
 * ]
 * ```
 *
 * Null for links created before this migration (backward-compatible).
 * Max 10 items per link, total size ≤ 25 MB — enforced at application layer.
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE shared_document_links
        ADD COLUMN IF NOT EXISTS attachments JSONB
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE shared_document_links
        DROP COLUMN IF EXISTS attachments
    `);
  },
};
