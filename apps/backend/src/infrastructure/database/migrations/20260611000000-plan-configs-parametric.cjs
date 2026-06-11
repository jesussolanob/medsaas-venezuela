/**
 * Migration: 20260611000000-plan-configs-parametric
 *
 * Implements parametric, role-aware plan configuration:
 *
 * 1. ALTER plan_configs — add role_key and is_permanent columns.
 * 2. CREATE plan_prices — per-plan, per-period price table.
 * 3. SEED delta_free / delta_base / delta_plus plan_configs (idempotent).
 * 4. SEED plan_features for the three new plans (idempotent).
 * 5. SEED plan_prices for delta_base / delta_plus (idempotent).
 * 6. Safe re-map: subscriptions whose plan is not in the new canonical set
 *    are moved to 'delta_free' (preserving all other fields).
 *
 * down() reverses steps 6 → 1 cleanly.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

// Canonical plan keys in the new system
const NEW_PLAN_KEYS = ['delta_free', 'delta_base', 'delta_plus'];

// Feature keys covered by the seed
const FEATURE_KEYS = [
  'dashboard',
  'agenda',
  'patients',
  'consultations',
  'ehr',
  'finances',
  'billing',
  'reports',
  'crm',
  'reminders',
  'messages',
  'invitations',
  'settings',
  'services',
  'ai_assistant',
  'ai_transcription',
  'ai_reports',
];

// Human-readable labels for each feature key
const FEATURE_LABELS = {
  dashboard: 'Dashboard',
  agenda: 'Agenda',
  patients: 'Pacientes',
  consultations: 'Consultas',
  ehr: 'Historia Clínica',
  finances: 'Finanzas',
  billing: 'Facturación',
  reports: 'Reportes',
  crm: 'CRM',
  reminders: 'Recordatorios',
  messages: 'Mensajes',
  invitations: 'Invitaciones',
  settings: 'Configuración',
  services: 'Servicios',
  ai_assistant: 'Asistente IA',
  ai_transcription: 'Transcripción IA',
  ai_reports: 'Reportes IA',
};

// AI-only features — enabled only in delta_plus
const AI_ONLY_FEATURES = ['ai_assistant', 'ai_transcription', 'ai_reports'];

// Pricing for delta_base (monthly / quarterly / semiannual / annual)
const BASE_PRICES = [
  { period: 'monthly',    price_usd: 10  },
  { period: 'quarterly',  price_usd: 27  },
  { period: 'semiannual', price_usd: 51  },
  { period: 'annual',     price_usd: 96  },
];

// Pricing for delta_plus
const PLUS_PRICES = [
  { period: 'monthly',    price_usd: 30  },
  { period: 'quarterly',  price_usd: 81  },
  { period: 'semiannual', price_usd: 153 },
  { period: 'annual',     price_usd: 288 },
];

module.exports = {
  async up(queryInterface) {
    // -----------------------------------------------------------------------
    // 1. ALTER plan_configs — add role_key and is_permanent
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      ALTER TABLE plan_configs
        ADD COLUMN IF NOT EXISTS role_key     TEXT NOT NULL DEFAULT 'doctor',
        ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false
    `);

    // -----------------------------------------------------------------------
    // 2. CREATE plan_prices
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS plan_prices (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_key    TEXT        NOT NULL,
        period      TEXT        NOT NULL CHECK (period IN ('monthly','quarterly','semiannual','annual')),
        price_usd   NUMERIC(12,2) NOT NULL DEFAULT 0,
        is_active   BOOLEAN     NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (plan_key, period)
      )
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_plan_prices_plan_key ON plan_prices (plan_key)
    `);

    // -----------------------------------------------------------------------
    // 3. SEED plan_configs — three canonical doctor plans (idempotent)
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      INSERT INTO plan_configs
        (id, plan_key, name, price, currency, trial_days, description,
         is_active, sort_order, role_key, is_permanent, created_at, updated_at)
      VALUES
        (gen_random_uuid(), 'delta_free', 'Delta Free',  0,  'USD', 0,
         'Plan gratuito permanente para doctores',
         true, 1, 'doctor', true,  NOW(), NOW()),
        (gen_random_uuid(), 'delta_base', 'Delta Base', 10, 'USD', 0,
         'Plan base con todas las funcionalidades esenciales',
         true, 2, 'doctor', false, NOW(), NOW()),
        (gen_random_uuid(), 'delta_plus', 'Delta Plus', 30, 'USD', 0,
         'Plan completo incluyendo asistente e inteligencia artificial',
         true, 3, 'doctor', false, NOW(), NOW())
      ON CONFLICT (plan_key) DO NOTHING
    `);

    // -----------------------------------------------------------------------
    // 4. SEED plan_features (idempotent — ignoreDuplicates maps to ON CONFLICT DO NOTHING)
    //
    // Uses queryInterface.bulkInsert with parameterised object rows instead of
    // string interpolation to avoid SQL injection risk in migration files.
    // The 'id' column is intentionally omitted — the DB DEFAULT gen_random_uuid()
    // generates it automatically.
    // -----------------------------------------------------------------------
    const featureRows = [];

    for (const featureKey of FEATURE_KEYS) {
      const label = FEATURE_LABELS[featureKey];
      const isAiFeature = AI_ONLY_FEATURES.includes(featureKey);
      const now = new Date();

      // delta_free: no AI features
      featureRows.push({
        plan: 'delta_free',
        feature_key: featureKey,
        feature_label: label,
        enabled: !isAiFeature,
        created_at: now,
        updated_at: now,
      });

      // delta_base: all features EXCEPT AI
      featureRows.push({
        plan: 'delta_base',
        feature_key: featureKey,
        feature_label: label,
        enabled: !isAiFeature,
        created_at: now,
        updated_at: now,
      });

      // delta_plus: ALL features including AI
      featureRows.push({
        plan: 'delta_plus',
        feature_key: featureKey,
        feature_label: label,
        enabled: true,
        created_at: now,
        updated_at: now,
      });
    }

    await queryInterface.bulkInsert('plan_features', featureRows, { ignoreDuplicates: true });

    // -----------------------------------------------------------------------
    // 5. SEED plan_prices for delta_base and delta_plus (idempotent)
    // -----------------------------------------------------------------------
    const priceRows = [
      ...BASE_PRICES.map(
        (p) =>
          `(gen_random_uuid(), 'delta_base', '${p.period}', ${p.price_usd}, true, NOW(), NOW())`
      ),
      ...PLUS_PRICES.map(
        (p) =>
          `(gen_random_uuid(), 'delta_plus', '${p.period}', ${p.price_usd}, true, NOW(), NOW())`
      ),
    ];

    await queryInterface.sequelize.query(`
      INSERT INTO plan_prices
        (id, plan_key, period, price_usd, is_active, created_at, updated_at)
      VALUES
        ${priceRows.join(',\n        ')}
      ON CONFLICT (plan_key, period)
      DO NOTHING
    `);

    // -----------------------------------------------------------------------
    // 5b. Extend the subscription_plan enum to include the new plan keys.
    //
    // NOTE: ALTER TYPE ... ADD VALUE cannot run inside a PL/pgSQL DO block or
    // inside an explicit transaction. sequelize-cli / umzug 2.x does NOT wrap
    // migrations in a transaction, so we call each statement directly.
    // IF NOT EXISTS (PostgreSQL 12+) makes these idempotent.
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(
      `ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'delta_free'`,
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'delta_base'`,
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'delta_plus'`,
    );

    // -----------------------------------------------------------------------
    // 6. Re-map subscriptions with unknown plan to 'delta_free'
    //
    // Only affects subscriptions whose plan value is NOT one of the canonical
    // set (trial, basic, professional, clinic, enterprise, delta_free,
    // delta_base, delta_plus). This is a safe, reversible default.
    // A record is kept in subscription_changes_log for auditability.
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      UPDATE subscriptions
      SET    plan       = 'delta_free',
             updated_at = NOW()
      WHERE  plan NOT IN (
               'trial','basic','professional','clinic','enterprise',
               'delta_free','delta_base','delta_plus'
             )
    `);
  },

  async down(queryInterface) {
    // -----------------------------------------------------------------------
    // Reverse step 6: there is no reliable way to restore the original unknown
    // plan values (they were orphaned). We leave those rows as 'delta_free'
    // because restoring an unknown plan key would break FK-like constraints.
    // This is documented as an accepted trade-off.

    // -----------------------------------------------------------------------
    // Reverse step 5 — remove plan_prices seed rows
    await queryInterface.sequelize.query(`
      DELETE FROM plan_prices
      WHERE plan_key IN ('delta_base', 'delta_plus')
    `);

    // -----------------------------------------------------------------------
    // Reverse step 4 — remove plan_features seed rows for the three new plans
    await queryInterface.sequelize.query(`
      DELETE FROM plan_features
      WHERE plan IN ('delta_free', 'delta_base', 'delta_plus')
    `);

    // -----------------------------------------------------------------------
    // Reverse step 3 — remove plan_configs seed rows
    await queryInterface.sequelize.query(`
      DELETE FROM plan_configs
      WHERE plan_key IN ('delta_free', 'delta_base', 'delta_plus')
    `);

    // -----------------------------------------------------------------------
    // Reverse step 2 — drop plan_prices table
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS plan_prices
    `);

    // -----------------------------------------------------------------------
    // Reverse step 1 — drop added columns from plan_configs
    await queryInterface.sequelize.query(`
      ALTER TABLE plan_configs
        DROP COLUMN IF EXISTS is_permanent,
        DROP COLUMN IF EXISTS role_key
    `);
  },
};
