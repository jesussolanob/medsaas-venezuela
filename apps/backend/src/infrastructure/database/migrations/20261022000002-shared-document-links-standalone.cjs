'use strict';

/**
 * Migration: 20261022000002-shared-document-links-standalone
 *
 * Extends `shared_document_links` to support standalone documents (recipe /
 * paraclinical / reposo issued outside a consultation):
 *
 *   1. ALTER consultation_id → DROP NOT NULL
 *      (existing rows all have consultation_id; constraint still holds for them)
 *   2. ADD standalone_document_id UUID NULL FK → standalone_documents(id)
 *   3. ADD CONSTRAINT shared_document_links_source_xor CHECK
 *      (consultation_id IS NOT NULL) <> (standalone_document_id IS NOT NULL)
 *      Exactly one of the two must be set — a link cannot be "both" or "neither".
 *   4. CREATE INDEX idx_shared_document_links_standalone on standalone_document_id
 *
 * DOWN (safe rollback):
 *   - Deletes standalone rows first (there should be none in production at the
 *     time this migration is first applied).
 *   - Drops the XOR constraint, then the column.
 *   - Restores NOT NULL on consultation_id.
 *
 * IDEMPOTENCY: uses IF NOT EXISTS / IF EXISTS where supported. The ALTER
 * COLUMN NOT NULL drop cannot be made truly idempotent in standard SQL but is
 * safe to re-run if the column is already nullable.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // 1. Drop NOT NULL from consultation_id
    //    Existing rows still have consultation_id — the XOR check will enforce
    //    that new rows have exactly one of the two columns set.
    await q.query(`
      ALTER TABLE shared_document_links
        ALTER COLUMN consultation_id DROP NOT NULL
    `);

    // 2. Add standalone_document_id column (nullable FK)
    await q.query(`
      ALTER TABLE shared_document_links
        ADD COLUMN IF NOT EXISTS standalone_document_id UUID NULL
          REFERENCES standalone_documents(id) ON DELETE CASCADE
    `);

    // 3. Add XOR check constraint
    //    (consultation_id IS NOT NULL) <> (standalone_document_id IS NOT NULL)
    //    is equivalent to:
    //    (consultation_id IS NOT NULL AND standalone_document_id IS NULL)
    //    OR (consultation_id IS NULL AND standalone_document_id IS NOT NULL)
    //
    //    All pre-existing rows have consultation_id set and standalone_document_id
    //    NULL, so they satisfy the constraint immediately.
    await q.query(`
      ALTER TABLE shared_document_links
        ADD CONSTRAINT IF NOT EXISTS shared_document_links_source_xor
          CHECK (
            (consultation_id IS NOT NULL) <> (standalone_document_id IS NOT NULL)
          )
    `);

    // 4. Index for lookups by standalone_document_id
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_document_links_standalone
        ON shared_document_links (standalone_document_id)
        WHERE standalone_document_id IS NOT NULL
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Reverse order.

    // a. Drop the index
    await q.query(`
      DROP INDEX IF EXISTS idx_shared_document_links_standalone
    `);

    // b. Remove XOR constraint
    await q.query(`
      ALTER TABLE shared_document_links
        DROP CONSTRAINT IF EXISTS shared_document_links_source_xor
    `);

    // c. Delete any standalone-document links before removing the FK column
    //    (in production at rollback time there should be none; this is defensive).
    await q.query(`
      DELETE FROM shared_document_links
        WHERE standalone_document_id IS NOT NULL
    `);

    // d. Drop the column
    await q.query(`
      ALTER TABLE shared_document_links
        DROP COLUMN IF EXISTS standalone_document_id
    `);

    // e. Restore NOT NULL on consultation_id
    //    Safe because we just deleted any rows that had consultation_id = NULL.
    await q.query(`
      ALTER TABLE shared_document_links
        ALTER COLUMN consultation_id SET NOT NULL
    `);
  },
};
