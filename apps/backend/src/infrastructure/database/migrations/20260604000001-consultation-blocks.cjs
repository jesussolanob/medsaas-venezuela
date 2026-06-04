/**
 * Migration: 20260604000001-consultation-blocks
 *
 * Creates the three tables required by the consultation-blocks module:
 *
 *   1. consultation_block_catalog     — master block definitions (read-mostly)
 *   2. doctor_consultation_blocks     — per-doctor overrides (composite PK)
 *   3. specialty_default_blocks       — per-specialty defaults (composite PK)
 *
 * Also seeds the catalog and specialty defaults to match the frontend legacy data
 * from apps/frontend/lib/consultation-blocks.ts and sql_migration_v25_fase2.sql.
 *
 * Notable addition vs. original Supabase SQL:
 *   - `default_enabled` column on consultation_block_catalog.
 *     The frontend resolveBlocksForDoctor() logic uses catalogEntry.default_enabled
 *     as the ultimate fallback (only 4 core blocks default to true).
 *
 * All DDL uses IF NOT EXISTS / IF EXISTS for idempotency.
 * down() drops all three tables cleanly (reverse order to respect FK constraints).
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    // ── 1. consultation_block_catalog ───────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS consultation_block_catalog (
        key                       text            PRIMARY KEY,
        default_label             text            NOT NULL,
        default_content_type      text            NOT NULL DEFAULT 'rich_text'
                                    CHECK (default_content_type IN
                                      ('rich_text','list','date','file','structured','numeric')),
        default_printable         boolean         NOT NULL DEFAULT true,
        default_send_to_patient   boolean         NOT NULL DEFAULT true,
        default_enabled           boolean         NOT NULL DEFAULT false,
        description               text,
        created_at                timestamptz     NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_consultation_block_catalog_key
        ON consultation_block_catalog (key)
    `);

    // ── 2. doctor_consultation_blocks ───────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS doctor_consultation_blocks (
        doctor_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        block_key           text        NOT NULL REFERENCES consultation_block_catalog(key) ON DELETE CASCADE,
        custom_label        text,
        custom_content_type text,
        enabled             boolean     NOT NULL DEFAULT true,
        sort_order          integer     NOT NULL DEFAULT 0,
        printable           boolean,
        send_to_patient     boolean,
        updated_at          timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (doctor_id, block_key)
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_consultation_blocks_doctor
        ON doctor_consultation_blocks (doctor_id)
    `);

    // ── 3. specialty_default_blocks ─────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS specialty_default_blocks (
        specialty     text        NOT NULL,
        block_key     text        NOT NULL REFERENCES consultation_block_catalog(key) ON DELETE CASCADE,
        enabled       boolean     NOT NULL DEFAULT true,
        sort_order    integer     NOT NULL DEFAULT 0,
        PRIMARY KEY (specialty, block_key)
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_specialty_default_blocks_specialty
        ON specialty_default_blocks (specialty)
    `);

    // ── 4. Seed: catalog (15 blocks) ────────────────────────────────────────
    await q.query(`
      INSERT INTO consultation_block_catalog
        (key, default_label, default_content_type, default_printable, default_send_to_patient, default_enabled, description)
      VALUES
        ('chief_complaint',  'Motivo de consulta',   'rich_text',  true,  true,  true,  'Lo que trae al paciente'),
        ('history',          'Antecedentes',         'rich_text',  true,  true,  false, 'Historia clínica del paciente'),
        ('physical_exam',    'Examen físico',        'rich_text',  true,  true,  false, 'Hallazgos del examen físico'),
        ('diagnosis',        'Diagnóstico',          'rich_text',  true,  true,  true,  'Impresión diagnóstica'),
        ('treatment',        'Tratamiento',          'rich_text',  true,  true,  true,  'Plan terapéutico general'),
        ('prescription',     'Prescripción',         'structured', true,  true,  true,  'Medicamentos recetados'),
        ('rest',             'Reposo',               'rich_text',  true,  true,  false, 'Indicación de reposo'),
        ('tasks',            'Tareas terapéuticas',  'rich_text',  true,  true,  false, 'Tareas para el paciente (psicología)'),
        ('nutrition_plan',   'Plan alimenticio',     'rich_text',  true,  true,  false, 'Guía nutricional personalizada'),
        ('exercises',        'Ejercicios',           'rich_text',  true,  true,  false, 'Rutina de ejercicios (fisioterapia)'),
        ('indications',      'Indicaciones',         'rich_text',  true,  true,  false, 'Indicaciones generales'),
        ('recommendations',  'Recomendaciones',      'rich_text',  true,  true,  false, 'Recomendaciones complementarias'),
        ('requested_exams',  'Exámenes solicitados', 'list',       true,  true,  false, 'Exámenes a realizar'),
        ('next_followup',    'Próximo control',      'date',       true,  true,  false, 'Fecha de seguimiento'),
        ('internal_notes',   'Notas internas',       'rich_text',  false, false, false, 'Solo para el doctor (no se imprime)')
      ON CONFLICT (key) DO UPDATE SET
        default_label           = EXCLUDED.default_label,
        default_content_type    = EXCLUDED.default_content_type,
        default_printable       = EXCLUDED.default_printable,
        default_send_to_patient = EXCLUDED.default_send_to_patient,
        default_enabled         = EXCLUDED.default_enabled,
        description             = EXCLUDED.description
    `);

    // ── 5. Seed: specialty defaults ─────────────────────────────────────────
    await q.query(`
      INSERT INTO specialty_default_blocks (specialty, block_key, enabled, sort_order) VALUES
        -- Medicina General
        ('Medicina General', 'chief_complaint', true, 1),
        ('Medicina General', 'physical_exam',   true, 2),
        ('Medicina General', 'diagnosis',       true, 3),
        ('Medicina General', 'treatment',       true, 4),
        ('Medicina General', 'prescription',    true, 5),
        ('Medicina General', 'rest',            true, 6),
        ('Medicina General', 'indications',     true, 7),
        ('Medicina General', 'next_followup',   true, 8),
        -- Medicina Interna
        ('Medicina Interna', 'chief_complaint', true, 1),
        ('Medicina Interna', 'history',         true, 2),
        ('Medicina Interna', 'physical_exam',   true, 3),
        ('Medicina Interna', 'diagnosis',       true, 4),
        ('Medicina Interna', 'requested_exams', true, 5),
        ('Medicina Interna', 'prescription',    true, 6),
        ('Medicina Interna', 'next_followup',   true, 7),
        -- Pediatría
        ('Pediatría', 'chief_complaint', true, 1),
        ('Pediatría', 'physical_exam',   true, 2),
        ('Pediatría', 'diagnosis',       true, 3),
        ('Pediatría', 'prescription',    true, 4),
        ('Pediatría', 'indications',     true, 5),
        ('Pediatría', 'next_followup',   true, 6),
        -- Psicología
        ('Psicología', 'chief_complaint', true, 1),
        ('Psicología', 'history',         true, 2),
        ('Psicología', 'tasks',           true, 3),
        ('Psicología', 'recommendations', true, 4),
        ('Psicología', 'internal_notes',  true, 5),
        ('Psicología', 'next_followup',   true, 6),
        -- Psiquiatría
        ('Psiquiatría', 'chief_complaint', true, 1),
        ('Psiquiatría', 'history',         true, 2),
        ('Psiquiatría', 'diagnosis',       true, 3),
        ('Psiquiatría', 'prescription',    true, 4),
        ('Psiquiatría', 'tasks',           true, 5),
        ('Psiquiatría', 'next_followup',   true, 6),
        -- Nutrición
        ('Nutrición', 'chief_complaint', true, 1),
        ('Nutrición', 'history',         true, 2),
        ('Nutrición', 'nutrition_plan',  true, 3),
        ('Nutrición', 'recommendations', true, 4),
        ('Nutrición', 'next_followup',   true, 5),
        -- Fisioterapia
        ('Fisioterapia', 'chief_complaint', true, 1),
        ('Fisioterapia', 'physical_exam',   true, 2),
        ('Fisioterapia', 'exercises',       true, 3),
        ('Fisioterapia', 'rest',            true, 4),
        ('Fisioterapia', 'indications',     true, 5),
        ('Fisioterapia', 'next_followup',   true, 6)
      ON CONFLICT (specialty, block_key) DO NOTHING
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    // Drop in reverse FK dependency order
    await q.query(`DROP TABLE IF EXISTS specialty_default_blocks`);
    await q.query(`DROP TABLE IF EXISTS doctor_consultation_blocks`);
    await q.query(`DROP TABLE IF EXISTS consultation_block_catalog`);
  },
};
