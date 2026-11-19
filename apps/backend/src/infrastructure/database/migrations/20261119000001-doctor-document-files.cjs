'use strict';

/**
 * Migration: 20261119000001-doctor-document-files
 *
 * Creates the `doctor_document_files` table for the "Documentos frecuentes"
 * library feature. Each row represents a file (PDF/image) the specialist
 * uploaded once and can reuse as an attachment when sharing consultation
 * documents with patients.
 *
 * Design notes:
 * - `mime_type` is TEXT + CHECK (not Postgres ENUM) — prevents the
 *   ALTER TYPE DDL pain that caused production outages (see CLAUDE.md).
 * - `deleted_at` is nullable (soft delete): storage has no delete and past
 *   share links may reference the object — the row is kept for referential
 *   integrity even after the doctor removes the file from the library.
 * - Partial index on (doctor_id) WHERE deleted_at IS NULL speeds up the
 *   "list active files" query that is called on every library page load.
 * - Idempotent (IF NOT EXISTS / IF NOT EXISTS).
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS doctor_document_files (
        id           UUID         NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
        doctor_id    UUID         NOT NULL REFERENCES profiles(id),
        name         TEXT         NOT NULL
                       CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
        storage_path TEXT         NOT NULL,
        mime_type    TEXT         NOT NULL
                       CHECK (mime_type IN (
                         'application/pdf',
                         'image/jpeg',
                         'image/png',
                         'image/webp'
                       )),
        size_bytes   INTEGER      NOT NULL CHECK (size_bytes > 0),
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        deleted_at   TIMESTAMPTZ
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_document_files_doctor_active
        ON doctor_document_files (doctor_id, created_at DESC)
        WHERE deleted_at IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS doctor_document_files`,
    );
  },
};
