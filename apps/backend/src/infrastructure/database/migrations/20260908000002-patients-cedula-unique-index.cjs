'use strict';

/**
 * Migration: 20260908000002-patients-cedula-unique-index
 *
 * Adds a UNIQUE index on (doctor_id, cedula_search_hash) so the database — not
 * only the application-level guard in CreatePatientUseCase — rejects two
 * active patients with the same cédula under the same doctor.
 *
 * Partial index (same pattern as patients_doctor_email_uq —
 * see 20260716000002-drop-patient-email-unique):
 *   - `cedula_search_hash IS NOT NULL`: patients can exist without a cédula.
 *   - `deleted_at IS NULL`: soft-deleted patients (patients-soft-delete,
 *     20260602000002) must not block a new record from reusing that cédula.
 *
 * Safe to apply: verified against production (2026-09-08) — zero patients
 * collide once every cédula is folded through the CANONICAL form
 * (normalizeCedulaForSearch in @delta/shared-crypto: uppercase, strips
 * separators, KEEPS the V/E/P prefix — "V-12345678" and "v12.345.678" are the
 * same person, "V-12345678" and "E-12345678" are not).
 *
 * IMPORTANT — this migration does NOT rehash existing rows. Rows written
 * before this change keep their OLD (pre-canonical) `cedula_search_hash`
 * value, computed straight from whatever was typed. Migrations run with only
 * DATABASE_URL and NODE_ENV — no ENCRYPTION_KEY — so they cannot decrypt
 * `cedula` to recompute it; that rehash is a separate, out-of-band script.
 * The old hashes are unique among themselves today (same production check),
 * so this index does not fail against current data. Closing the gap between
 * "same person, different old hash" is handled at read time by trying
 * multiple hash variants (CreatePatientUseCase's duplicate guard,
 * ResolveQuoteRecipientPatientUseCase's cedulaLookupVariants) — not by this
 * index alone.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS patients_doctor_cedula_uq
        ON patients(doctor_id, cedula_search_hash)
        WHERE cedula_search_hash IS NOT NULL AND deleted_at IS NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS patients_doctor_cedula_uq;');
  },
};
