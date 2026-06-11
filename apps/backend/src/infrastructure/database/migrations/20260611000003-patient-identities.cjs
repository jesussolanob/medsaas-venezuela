/**
 * Migration: 20260611000003-patient-identities
 *
 * Introduces the patient_identities master table — a global identity registry
 * that links one row per unique cedula across all doctors. This enables
 * internal analytics and traceability while remaining completely transparent
 * to the doctor-facing API (no cross-doctor data is ever exposed).
 *
 * Changes:
 *   1. CREATE TABLE patient_identities
 *        id           UUID PK (gen_random_uuid())
 *        cedula_hash  TEXT NOT NULL UNIQUE  — HMAC-SHA256 of the normalized
 *                     cedula using the SAME global secret as
 *                     patients.cedula_search_hash. Values are therefore
 *                     directly comparable between the two tables.
 *        cedula_encrypted  TEXT NOT NULL    — AES-256-GCM ciphertext for
 *                     compliance / recovery purposes.
 *        created_at / updated_at
 *
 *   2. ALTER TABLE patients
 *        ADD COLUMN identity_id UUID NULL
 *        ADD CONSTRAINT fk_patients_identity_id
 *          REFERENCES patient_identities(id) ON DELETE SET NULL
 *        ADD INDEX idx_patients_identity_id
 *
 *   3. BACKFILL:
 *        For every patient with a non-null cedula_search_hash, find-or-create
 *        a patient_identities row (reuse cedula_search_hash as cedula_hash;
 *        reuse the already-encrypted cedula column as cedula_encrypted), then
 *        set patients.identity_id.
 *        Operation is idempotent — safe to re-run.
 *
 * down():
 *   - Remove FK constraint + identity_id column from patients.
 *   - DROP TABLE patient_identities.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    // ------------------------------------------------------------------
    // 1. Create patient_identities table
    // ------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS patient_identities (
        id               UUID        NOT NULL DEFAULT gen_random_uuid(),
        cedula_hash      TEXT        NOT NULL,
        cedula_encrypted TEXT        NOT NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT patient_identities_pkey        PRIMARY KEY (id),
        CONSTRAINT patient_identities_cedula_hash_uq UNIQUE (cedula_hash)
      );
    `);

    // ------------------------------------------------------------------
    // 2. Add identity_id column + FK to patients
    // ------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      ALTER TABLE patients
        ADD COLUMN IF NOT EXISTS identity_id UUID NULL;
    `);

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'fk_patients_identity_id'
            AND table_name = 'patients'
        ) THEN
          ALTER TABLE patients
            ADD CONSTRAINT fk_patients_identity_id
            FOREIGN KEY (identity_id)
            REFERENCES patient_identities(id)
            ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_patients_identity_id
        ON patients (identity_id);
    `);

    // ------------------------------------------------------------------
    // 3. Backfill: find-or-create patient_identities rows and link them
    // ------------------------------------------------------------------
    // For each distinct cedula_search_hash in patients (non-null), pick
    // the most recently created representative row to source cedula_encrypted
    // (the AES-GCM ciphertext stored in the cedula column).
    //
    // Then INSERT INTO patient_identities ON CONFLICT DO NOTHING so the
    // operation is idempotent. Finally UPDATE patients.identity_id.
    await queryInterface.sequelize.query(`
      WITH representatives AS (
        -- One representative patient per cedula_hash (latest created wins)
        SELECT DISTINCT ON (cedula_search_hash)
          id            AS patient_id,
          cedula_search_hash,
          cedula        AS cedula_encrypted
        FROM patients
        WHERE cedula_search_hash IS NOT NULL
          AND cedula IS NOT NULL
          AND deleted_at IS NULL
        ORDER BY cedula_search_hash, created_at DESC
      ),
      inserted AS (
        -- Insert identity row if it does not already exist
        INSERT INTO patient_identities (cedula_hash, cedula_encrypted)
        SELECT cedula_search_hash, cedula_encrypted
        FROM representatives
        ON CONFLICT (cedula_hash) DO NOTHING
        RETURNING id, cedula_hash
      ),
      all_identities AS (
        -- Union newly inserted + pre-existing rows to get complete id mapping
        SELECT id, cedula_hash FROM inserted
        UNION ALL
        SELECT pi.id, pi.cedula_hash
        FROM patient_identities pi
        WHERE pi.cedula_hash IN (SELECT cedula_search_hash FROM representatives)
          AND pi.id NOT IN (SELECT id FROM inserted)
      )
      UPDATE patients p
      SET    identity_id = ai.id,
             updated_at  = NOW()
      FROM   all_identities ai
      WHERE  p.cedula_search_hash = ai.cedula_hash
        AND  p.identity_id IS NULL;
    `);
  },

  async down(queryInterface) {
    // Remove FK constraint first, then the column, then the table.
    await queryInterface.sequelize.query(`
      ALTER TABLE patients
        DROP CONSTRAINT IF EXISTS fk_patients_identity_id;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_patients_identity_id;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE patients
        DROP COLUMN IF EXISTS identity_id;
    `);

    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS patient_identities;
    `);
  },
};
