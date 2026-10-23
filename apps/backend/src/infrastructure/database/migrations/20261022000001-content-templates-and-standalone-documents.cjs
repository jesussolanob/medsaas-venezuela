'use strict';

/**
 * Migration: 20261022000001-content-templates-and-standalone-documents
 *
 * Creates tables and seeds for the Plantillas de contenido + Recipes y
 * paraclínicos sin consulta modules. Four parts:
 *
 *   1. `content_templates`      — doctor-private content templates
 *   2. `standalone_documents`   — recipe/paraclinical/reposo docs without
 *                                 a consultation (draft → issued → voided)
 *   3. role_capabilities seed   — doctor × {view,create,edit,delete} for
 *                                 content_templates and standalone_documents
 *   4. plan_features seed       — every plan gets a row; delta_base +
 *                                 delta_plus + free_trial = enabled
 *
 * TEXT + CHECK instead of ENUM — avoids the production crash class
 * documented in memory-bank (enums-de-postgres-sin-el-valor).
 *
 * Idempotent: all DDL uses IF NOT EXISTS; seeds use ON CONFLICT … DO UPDATE.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // ── Part 1: content_templates ─────────────────────────────────────────────
    // Private per-doctor content templates (recipe / paraclinical / reposo /
    // presupuesto). No shared "factory" templates per owner decision E.1.
    //
    // content is JSONB validated at the DTO/Zod boundary, not in SQL:
    //   recipe       → { medications: Medication[], notes: string }
    //   paraclinical → { items: { exam_name, notes }[] }
    //   reposo       → { diagnosis, days: number (1..365), comments }
    //   presupuesto  → { items: QuoteItemTemplate[] } (no unit_price_usd for
    //                   service/product — price is resolved live at apply time)
    await q.query(`
      CREATE TABLE IF NOT EXISTS content_templates (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        doctor_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        type        TEXT        NOT NULL
                      CHECK (type IN ('recipe','paraclinical','reposo','presupuesto')),
        name        TEXT        NOT NULL,
        content     JSONB       NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_content_templates_doctor_type
        ON content_templates (doctor_id, type)
    `);

    // ── Part 2: standalone_documents ─────────────────────────────────────────
    // Recipe / paraclinical / reposo documents issued without a consultation.
    //
    // State machine: draft → issued → voided (one-way; no reversal).
    // code is NULL in draft; assigned (REC/PAR/REP-YYYYMM-NNNN) on issue.
    // UNIQUE (doctor_id, code) mirrors UNIQUE (doctor_id, quote_number) in
    // quotes — per-doctor uniqueness, not global.
    // void_reason is free-text (no enum needed; only informational).
    await q.query(`
      CREATE TABLE IF NOT EXISTS standalone_documents (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        doctor_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        patient_id   UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        type         TEXT        NOT NULL
                       CHECK (type IN ('recipe','paraclinical','reposo')),
        code         TEXT        NULL,
        status       TEXT        NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','issued','voided')),
        content      JSONB       NOT NULL,
        void_reason  TEXT        NULL,
        issued_at    TIMESTAMPTZ NULL,
        voided_at    TIMESTAMPTZ NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT standalone_documents_code_unique UNIQUE (doctor_id, code)
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_standalone_documents_doctor
        ON standalone_documents (doctor_id, created_at DESC)
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_standalone_documents_patient
        ON standalone_documents (patient_id, created_at DESC)
    `);

    // ── Part 3: role_capabilities — doctor × content_templates ───────────────
    await q.query(`
      INSERT INTO role_capabilities
        (id, role, module_key, action, allowed, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), 'doctor', 'content_templates', 'view',   true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'content_templates', 'create', true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'content_templates', 'edit',   true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'content_templates', 'delete', true, now(), now())
      ON CONFLICT (role, module_key, action)
      DO UPDATE SET
        allowed    = EXCLUDED.allowed,
        updated_at = now()
    `);

    // ── Part 3b: role_capabilities — doctor × standalone_documents ───────────
    await q.query(`
      INSERT INTO role_capabilities
        (id, role, module_key, action, allowed, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), 'doctor', 'standalone_documents', 'view',   true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'standalone_documents', 'create', true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'standalone_documents', 'edit',   true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'standalone_documents', 'delete', true, now(), now())
      ON CONFLICT (role, module_key, action)
      DO UPDATE SET
        allowed    = EXCLUDED.allowed,
        updated_at = now()
    `);

    // ── Part 4: plan_features — content_templates ─────────────────────────────
    // delta_base + delta_plus + free_trial = enabled (same policy as quotes for
    // Plus; content creation is Base+).  Every other plan = false so they appear
    // in /admin/plan-features and can be toggled.
    await q.query(`
      INSERT INTO plan_features
        (id, plan, feature_key, feature_label, enabled, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), 'delta_plus',   'content_templates', 'Plantillas de contenido', true,  now(), now()),
        (uuid_generate_v4(), 'free_trial',   'content_templates', 'Plantillas de contenido', true,  now(), now()),
        (uuid_generate_v4(), 'delta_base',   'content_templates', 'Plantillas de contenido', true,  now(), now()),
        (uuid_generate_v4(), 'delta_free',   'content_templates', 'Plantillas de contenido', false, now(), now()),
        (uuid_generate_v4(), 'trial',        'content_templates', 'Plantillas de contenido', false, now(), now()),
        (uuid_generate_v4(), 'basic',        'content_templates', 'Plantillas de contenido', false, now(), now()),
        (uuid_generate_v4(), 'professional', 'content_templates', 'Plantillas de contenido', false, now(), now()),
        (uuid_generate_v4(), 'clinic',       'content_templates', 'Plantillas de contenido', false, now(), now())
      ON CONFLICT (plan, feature_key)
      DO UPDATE SET
        enabled       = EXCLUDED.enabled,
        feature_label = EXCLUDED.feature_label,
        updated_at    = now()
    `);

    // ── Part 4b: plan_features — standalone_documents ─────────────────────────
    await q.query(`
      INSERT INTO plan_features
        (id, plan, feature_key, feature_label, enabled, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), 'delta_plus',   'standalone_documents', 'Recipes y paraclínicos', true,  now(), now()),
        (uuid_generate_v4(), 'free_trial',   'standalone_documents', 'Recipes y paraclínicos', true,  now(), now()),
        (uuid_generate_v4(), 'delta_base',   'standalone_documents', 'Recipes y paraclínicos', true,  now(), now()),
        (uuid_generate_v4(), 'delta_free',   'standalone_documents', 'Recipes y paraclínicos', false, now(), now()),
        (uuid_generate_v4(), 'trial',        'standalone_documents', 'Recipes y paraclínicos', false, now(), now()),
        (uuid_generate_v4(), 'basic',        'standalone_documents', 'Recipes y paraclínicos', false, now(), now()),
        (uuid_generate_v4(), 'professional', 'standalone_documents', 'Recipes y paraclínicos', false, now(), now()),
        (uuid_generate_v4(), 'clinic',       'standalone_documents', 'Recipes y paraclínicos', false, now(), now())
      ON CONFLICT (plan, feature_key)
      DO UPDATE SET
        enabled       = EXCLUDED.enabled,
        feature_label = EXCLUDED.feature_label,
        updated_at    = now()
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Reverse order

    // 4b. Remove standalone_documents plan_features
    await q.query(`DELETE FROM plan_features WHERE feature_key = 'standalone_documents'`);

    // 4. Remove content_templates plan_features
    await q.query(`DELETE FROM plan_features WHERE feature_key = 'content_templates'`);

    // 3b. Remove standalone_documents role_capabilities
    await q.query(
      `DELETE FROM role_capabilities WHERE module_key = 'standalone_documents' AND role = 'doctor'`,
    );

    // 3. Remove content_templates role_capabilities
    await q.query(
      `DELETE FROM role_capabilities WHERE module_key = 'content_templates' AND role = 'doctor'`,
    );

    // 2. Drop standalone_documents (indexes drop with table)
    await q.query(`DROP TABLE IF EXISTS standalone_documents`);

    // 1. Drop content_templates (indexes drop with table)
    await q.query(`DROP TABLE IF EXISTS content_templates`);
  },
};
