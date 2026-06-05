/**
 * Migration: 20260605000001-doctor-templates
 *
 * Creates the `doctor_templates` table for doctor PDF template configuration.
 *
 * Schema:
 *   - id              uuid PK, default gen_random_uuid()
 *   - doctor_id       uuid NOT NULL, FK → profiles(id) ON DELETE CASCADE
 *   - template_type   text NOT NULL — one of: informe | recipe | prescripciones | reposo
 *   - logo_url        text NULL
 *   - signature_url   text NULL
 *   - font_family     text NOT NULL DEFAULT 'Inter'
 *   - header_text     text NOT NULL DEFAULT ''
 *   - footer_text     text NOT NULL DEFAULT ''
 *   - show_logo       boolean NOT NULL DEFAULT true
 *   - show_signature  boolean NOT NULL DEFAULT true
 *   - primary_color   text NOT NULL DEFAULT '#0891b2'
 *   - created_at      timestamptz NOT NULL DEFAULT now()
 *   - updated_at      timestamptz NOT NULL DEFAULT now()
 *
 * Constraints:
 *   - UNIQUE(doctor_id, template_type) — one template per type per doctor
 *   - FK to profiles(id) ON DELETE CASCADE
 *
 * Indexes:
 *   - idx_doctor_templates_doctor ON doctor_templates(doctor_id)
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`
      CREATE TABLE IF NOT EXISTS doctor_templates (
        id              uuid        NOT NULL DEFAULT gen_random_uuid(),
        doctor_id       uuid        NOT NULL,
        template_type   text        NOT NULL,
        logo_url        text                 NULL,
        signature_url   text                 NULL,
        font_family     text        NOT NULL DEFAULT 'Inter',
        header_text     text        NOT NULL DEFAULT '',
        footer_text     text        NOT NULL DEFAULT '',
        show_logo       boolean     NOT NULL DEFAULT true,
        show_signature  boolean     NOT NULL DEFAULT true,
        primary_color   text        NOT NULL DEFAULT '#0891b2',
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CONSTRAINT uq_doctor_templates_doctor_type
          UNIQUE (doctor_id, template_type),
        CONSTRAINT fk_doctor_templates_doctor
          FOREIGN KEY (doctor_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_doctor_templates_doctor
        ON doctor_templates (doctor_id)
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`DROP INDEX IF EXISTS idx_doctor_templates_doctor`);
    await q.query(`DROP TABLE IF EXISTS doctor_templates`);
  },
};
