/**
 * Migration: 20260612000000-credential-verification
 *
 * Creates two tables:
 *
 *   1. credential_verifiers — registry of external portals per credential type.
 *      Each row describes HOW to query a specific portal (method, URL, parser).
 *      Seeded idempotently with the SACS/MPPS entry.
 *
 *   2. credential_verifications — result of a verification attempt per doctor.
 *      Unique per (doctor_id, credential_type). Stores status, evidence, and
 *      retry metadata.
 *
 * Security notes:
 *   - declared_value stores the MPPS number the doctor declared (not cedula).
 *   - evidence JSONB must never contain raw cedula; only matched_name (from SACS),
 *     fecha_registro, tomo_registro, folio_registro, profesion.
 *   - Application layer enforces: NEVER log PII from these tables.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    // 1. credential_verifiers ------------------------------------------------
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS credential_verifiers (
        id                UUID        NOT NULL DEFAULT gen_random_uuid(),
        credential_type   TEXT        NOT NULL,
        profession_code   TEXT        NULL,
        jurisdiction      TEXT        NULL,
        portal_name       TEXT        NULL,
        portal_url        TEXT        NULL,
        method            TEXT        NOT NULL,
        request_template  JSONB       NULL,
        required_input    TEXT        NULL,
        response_parser   TEXT        NULL,
        has_captcha       BOOLEAN     NOT NULL DEFAULT false,
        tls_insecure      BOOLEAN     NOT NULL DEFAULT false,
        status            TEXT        NOT NULL DEFAULT 'active',
        last_checked_at   TIMESTAMPTZ NULL,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT credential_verifiers_pkey
          PRIMARY KEY (id),
        CONSTRAINT credential_verifiers_method_check
          CHECK (method IN ('xajax-post', 'form-post', 'api-json', 'manual')),
        CONSTRAINT credential_verifiers_required_input_check
          CHECK (required_input IN ('cedula', 'mpps', 'nombre') OR required_input IS NULL),
        CONSTRAINT credential_verifiers_status_check
          CHECK (status IN ('active', 'flaky', 'down', 'manual_only'))
      );
    `);

    // 2. Seed SACS/MPPS verifier (idempotent) --------------------------------
    await queryInterface.sequelize.query(`
      INSERT INTO credential_verifiers (
        credential_type,
        profession_code,
        jurisdiction,
        portal_name,
        portal_url,
        method,
        request_template,
        required_input,
        response_parser,
        has_captcha,
        tls_insecure,
        status
      )
      SELECT
        'mpps',
        NULL,
        'nacional',
        'SACS',
        'https://sistemas.sacs.gob.ve/consultas/prfsnal_salud',
        'xajax-post',
        NULL,
        'cedula',
        'sacs-xajax',
        false,
        true,
        'active'
      WHERE NOT EXISTS (
        SELECT 1 FROM credential_verifiers
        WHERE credential_type = 'mpps'
          AND jurisdiction    = 'nacional'
          AND response_parser = 'sacs-xajax'
      );
    `);

    // 3. credential_verifications --------------------------------------------
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS credential_verifications (
        id               UUID        NOT NULL DEFAULT gen_random_uuid(),
        doctor_id        UUID        NOT NULL,
        credential_type  TEXT        NOT NULL,
        declared_value   TEXT        NULL,
        verifier_id      UUID        NULL,
        status           TEXT        NOT NULL DEFAULT 'pending',
        evidence         JSONB       NULL,
        checked_at       TIMESTAMPTZ NULL,
        attempts         INTEGER     NOT NULL DEFAULT 0,
        last_error       TEXT        NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT credential_verifications_pkey
          PRIMARY KEY (id),
        CONSTRAINT credential_verifications_doctor_cred_uniq
          UNIQUE (doctor_id, credential_type),
        CONSTRAINT fk_credential_verifications_doctor_id
          FOREIGN KEY (doctor_id)
          REFERENCES profiles(id)
          ON DELETE CASCADE,
        CONSTRAINT fk_credential_verifications_verifier_id
          FOREIGN KEY (verifier_id)
          REFERENCES credential_verifiers(id)
          ON DELETE SET NULL,
        CONSTRAINT credential_verifications_status_check
          CHECK (
            status IN ('pending', 'verified', 'not_found', 'mismatch', 'error')
          )
      );
    `);

    // 4. Indexes --------------------------------------------------------------
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_credential_verifications_doctor_id
        ON credential_verifications (doctor_id);
      CREATE INDEX IF NOT EXISTS idx_credential_verifications_status
        ON credential_verifications (status);
      CREATE INDEX IF NOT EXISTS idx_credential_verifiers_type
        ON credential_verifiers (credential_type);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP TABLE IF EXISTS credential_verifications CASCADE;',
    );
    await queryInterface.sequelize.query(
      'DROP TABLE IF EXISTS credential_verifiers CASCADE;',
    );
  },
};
