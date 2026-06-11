/**
 * Migration: 20260611000007-specialties
 *
 * Creates the `specialties` catalogue table so medical specialties can be
 * managed from the database without redeployment.
 *
 * Seeds the initial list idempotently via ON CONFLICT (name) DO NOTHING so
 * re-running (e.g. after a failed deploy) is safe.
 *
 * down() drops the table cleanly.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

const SEED_NAMES = [
  'Medicina General',
  'Cardiología',
  'Dermatología',
  'Endocrinología',
  'Gastroenterología',
  'Ginecología y Obstetricia',
  'Hematología',
  'Infectología',
  'Medicina Interna',
  'Nefrología',
  'Neumología',
  'Neurología',
  'Odontología',
  'Oftalmología',
  'Oncología',
  'Ortopedia y Traumatología',
  'Otorrinolaringología',
  'Pediatría',
  'Psicología',
  'Psiquiatría',
  'Reumatología',
  'Fisioterapia',
  'Urología',
  'Cirugía General',
  'Cirugía Plástica',
  'Medicina de Emergencia',
  'Radiología',
  'Nutrición',
  'Otra',
];

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // Create table -------------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS specialties (
        id         UUID        NOT NULL DEFAULT gen_random_uuid(),
        name       TEXT        NOT NULL,
        is_active  BOOLEAN     NOT NULL DEFAULT true,
        sort_order INTEGER     NOT NULL DEFAULT 100,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT specialties_pkey
          PRIMARY KEY (id),
        CONSTRAINT specialties_name_unique
          UNIQUE (name)
      )
    `);

    // Index for the public listing query (active rows ordered by sort_order, name)
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_specialties_active_sort
        ON specialties (is_active, sort_order, name)
    `);

    // Seed ---------------------------------------------------------------
    const values = SEED_NAMES.map(
      (name, idx) =>
        `(gen_random_uuid(), '${name.replace(/'/g, "''")}', true, ${(idx + 1) * 10}, NOW(), NOW())`,
    ).join(',\n        ');

    await q.query(`
      INSERT INTO specialties (id, name, is_active, sort_order, created_at, updated_at)
      VALUES
        ${values}
      ON CONFLICT (name) DO NOTHING
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`DROP INDEX IF EXISTS idx_specialties_active_sort`);
    await q.query(`DROP TABLE IF EXISTS specialties`);
  },
};
