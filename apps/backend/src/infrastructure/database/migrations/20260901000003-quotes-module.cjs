'use strict';

/**
 * Migration: 20260901000003-quotes-module
 *
 * Creates the full schema for the Quotes/Presupuestos module. Seven parts:
 *
 *   1. ALTER TABLE leads           — add email (text null) and last_name (text null)
 *   2. `quotes`                    — quote header per doctor
 *   3. `quote_items`               — snapshot line items (no FK to catalog)
 *   4. `quote_share_links`         — single-use public access tokens
 *   5. role_capabilities seed      — doctor can view/create/edit/delete quotes
 *   6. plan_features seed          — every plan gets a row; delta_plus + free_trial = enabled
 *   7. email_templates seed        — quote_sent template (link-only, no attachment)
 *
 * Idempotent: all DDL uses IF NOT EXISTS / IF NOT EXISTS / ON CONFLICT guards.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // ── Part 1: ALTER TABLE leads ─────────────────────────────────────────────
    // Add email and last_name for prospective-client (non-patient) quotes.
    // Not encrypted — leads are prospect data, not PHI (same policy as phone).
    await q.query(`
      ALTER TABLE leads
        ADD COLUMN IF NOT EXISTS last_name TEXT NULL,
        ADD COLUMN IF NOT EXISTS email    TEXT NULL
    `);

    // ── Part 2: quotes ────────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS quotes (
        id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        doctor_id       UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        quote_number    TEXT          NOT NULL,
        patient_id      UUID          NULL REFERENCES patients(id) ON DELETE SET NULL,
        lead_id         UUID          NULL REFERENCES leads(id) ON DELETE SET NULL,
        status          TEXT          NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
        valid_until     DATE          NULL,
        notes           TEXT          NOT NULL DEFAULT '',
        subtotal_usd    NUMERIC(12,2) NOT NULL DEFAULT 0,
        discount_usd    NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_usd       NUMERIC(12,2) NOT NULL DEFAULT 0,
        bcv_rate        NUMERIC(12,4) NULL,
        total_bs        NUMERIC(14,2) NULL,
        sent_at         TIMESTAMPTZ   NULL,
        created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT quotes_recipient_xor
          CHECK ((patient_id IS NOT NULL) <> (lead_id IS NOT NULL)),
        CONSTRAINT quotes_doctor_number_unique
          UNIQUE (doctor_id, quote_number)
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_doctor_id
        ON quotes (doctor_id)
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_doctor_status
        ON quotes (doctor_id, status)
    `);

    // ── Part 3: quote_items ───────────────────────────────────────────────────
    // 🔴 Name, description, and price are COPIED — no FK to catalog.
    // source_id is informational only; the catalog can change or disappear.
    await q.query(`
      CREATE TABLE IF NOT EXISTS quote_items (
        id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_id        UUID          NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        doctor_id       UUID          NOT NULL,
        kind            TEXT          NOT NULL CHECK (kind IN ('service', 'product')),
        source_id       UUID          NULL,
        name            TEXT          NOT NULL,
        description     TEXT          NOT NULL DEFAULT '',
        quantity        NUMERIC(12,2) NOT NULL,
        unit_price_usd  NUMERIC(12,2) NOT NULL,
        amount_usd      NUMERIC(12,2) NOT NULL,
        sort_order      INTEGER       NOT NULL DEFAULT 0
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id
        ON quote_items (quote_id)
    `);

    // ── Part 4: quote_share_links ─────────────────────────────────────────────
    // Token: 48 bytes encoded as base64url (~64 chars). Link-only access, no code.
    await q.query(`
      CREATE TABLE IF NOT EXISTS quote_share_links (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        quote_id    UUID        NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        token       TEXT        NOT NULL UNIQUE,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at  TIMESTAMPTZ NULL
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_quote_share_links_token
        ON quote_share_links (token)
        WHERE revoked_at IS NULL
    `);

    // ── Part 5: role_capabilities — doctor × quotes ───────────────────────────
    await q.query(`
      INSERT INTO role_capabilities
        (id, role, module_key, action, allowed, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), 'doctor', 'quotes', 'view',   true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'quotes', 'create', true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'quotes', 'edit',   true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'quotes', 'delete', true, now(), now())
      ON CONFLICT (role, module_key, action)
      DO UPDATE SET
        allowed    = EXCLUDED.allowed,
        updated_at = now()
    `);

    // ── Part 6: plan_features — one row per plan, no exceptions ──────────────
    // Without a row, planUnlocks() returns false and the module is invisible
    // in /admin/plan-features.
    await q.query(`
      INSERT INTO plan_features
        (id, plan, feature_key, feature_label, enabled, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), 'delta_plus',   'quotes', 'Cotizaciones', true,  now(), now()),
        (uuid_generate_v4(), 'free_trial',   'quotes', 'Cotizaciones', true,  now(), now()),
        (uuid_generate_v4(), 'delta_base',   'quotes', 'Cotizaciones', false, now(), now()),
        (uuid_generate_v4(), 'delta_free',   'quotes', 'Cotizaciones', false, now(), now()),
        (uuid_generate_v4(), 'trial',        'quotes', 'Cotizaciones', false, now(), now()),
        (uuid_generate_v4(), 'basic',        'quotes', 'Cotizaciones', false, now(), now()),
        (uuid_generate_v4(), 'professional', 'quotes', 'Cotizaciones', false, now(), now()),
        (uuid_generate_v4(), 'clinic',       'quotes', 'Cotizaciones', false, now(), now())
      ON CONFLICT (plan, feature_key)
      DO UPDATE SET
        enabled       = EXCLUDED.enabled,
        feature_label = EXCLUDED.feature_label,
        updated_at    = now()
    `);

    // ── Part 7: email_templates — quote_sent ──────────────────────────────────
    // Link-only (no code, no attachment). Pattern: ON CONFLICT (name) DO NOTHING.
    // Placeholders: {{recipientName}}, {{doctorName}}, {{quoteNumber}}, {{url}},
    //               {{expiresAt}}, {{totalUsd}}
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Presupuesto médico</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .quote-box { background: #f0fdfa; border: 2px solid #0d9488; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .quote-box .number { font-size: 22px; font-weight: 800; color: #0f766e; font-family: monospace; }
    .quote-box .amount { font-size: 18px; font-weight: 600; color: #0f766e; margin-top: 8px; }
    .quote-box .label { font-size: 13px; color: #64748b; margin-top: 4px; }
    .btn { display: inline-block; background: #0d9488; color: #fff; text-decoration: none; border-radius: 6px; padding: 12px 28px; font-size: 15px; font-weight: 600; margin: 16px 0; }
    .info-box { background: #fefce8; border-left: 4px solid #ca8a04; border-radius: 4px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #713f12; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Presupuesto / Cotización</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{recipientName}}</strong>,</p>
      <p><strong>{{doctorName}}</strong> le ha enviado un presupuesto para los servicios solicitados.</p>
      <div class="quote-box">
        <div class="number">{{quoteNumber}}</div>
        <div class="amount">Total: USD {{totalUsd}}</div>
        <div class="label">Válido hasta: {{expiresAt}}</div>
      </div>
      <p style="text-align:center">
        <a class="btn" href="{{url}}">Ver presupuesto completo</a>
      </p>
      <p>O copie y pegue este enlace en su navegador:</p>
      <p style="word-break:break-all; font-size:13px; color:#475569;">{{url}}</p>
      <div class="info-box">
        <strong>Importante:</strong> Este enlace es de uso personal y confidencial. No lo comparta con terceros.
      </div>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    await q.query(
      `INSERT INTO email_templates (id, name, subject, html, text, description, is_active, created_at, updated_at)
       VALUES (
         gen_random_uuid(),
         'quote_sent',
         'Su presupuesto {{quoteNumber}} está listo',
         :html,
         NULL,
         'Enlace de acceso a presupuesto enviado por el especialista',
         true,
         NOW(),
         NOW()
       )
       ON CONFLICT (name) DO NOTHING`,
      { replacements: { html } },
    );
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Reverse order

    // 7. Remove quote_sent email template
    await q.query(`DELETE FROM email_templates WHERE name = 'quote_sent'`);

    // 6. Remove plan_features rows
    await q.query(`DELETE FROM plan_features WHERE feature_key = 'quotes'`);

    // 5. Remove role_capabilities rows
    await q.query(`DELETE FROM role_capabilities WHERE module_key = 'quotes' AND role = 'doctor'`);

    // 4. Drop quote_share_links (index drops with table)
    await q.query(`DROP TABLE IF EXISTS quote_share_links`);

    // 3. Drop quote_items (index drops with table)
    await q.query(`DROP TABLE IF EXISTS quote_items`);

    // 2. Drop quotes (indexes drop with table)
    await q.query(`DROP TABLE IF EXISTS quotes`);

    // 1. Remove leads columns
    await q.query(`
      ALTER TABLE leads
        DROP COLUMN IF EXISTS email,
        DROP COLUMN IF EXISTS last_name
    `);
  },
};
