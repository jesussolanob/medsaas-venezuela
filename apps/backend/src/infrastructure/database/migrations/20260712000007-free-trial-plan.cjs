/**
 * Migration: 20260712000007-free-trial-plan
 *
 * Adds the "Free Trial" plan — a 30-day onboarding plan assigned to every new
 * doctor at registration. It is NOT public (excluded from the catalog use-case
 * by plan_key filter) and requires no plan_prices rows (zero-cost trial).
 *
 * Changes:
 *   1. Extend subscription_plan enum with 'free_trial'.
 *   2. Insert plan_config for free_trial (is_permanent=false, is_active=true).
 *      Excluded from the public catalog by plan_key in get-public-plan-catalog
 *      use-case — no dedicated column needed.
 *   3. Insert plan_features for free_trial mirroring delta_plus exactly
 *      (all features including AI enabled). Idempotent (ON CONFLICT DO NOTHING).
 *
 * down(): removes plan_features and plan_config for free_trial.
 *   The enum value cannot be removed (Postgres limitation) — this is an
 *   accepted trade-off documented below.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

// All feature keys from the 20260611000000-plan-configs-parametric migration.
// free_trial mirrors delta_plus: ALL features enabled, including AI.
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

module.exports = {
  async up(queryInterface) {
    // -----------------------------------------------------------------------
    // 1. Extend the subscription_plan enum.
    //    ALTER TYPE ... ADD VALUE cannot run inside a transaction.
    //    IF NOT EXISTS (PostgreSQL 12+) makes it idempotent.
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(
      `ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'free_trial'`,
    );

    // -----------------------------------------------------------------------
    // 2. Insert plan_config for free_trial.
    //
    //    Exclusion from public catalog: the get-public-plan-catalog use-case
    //    filters by plan_key — 'free_trial' is excluded there in code.
    //    No dedicated is_public column is added to plan_configs (YAGNI).
    //
    //    is_permanent=false so the lazy-downgrade path fires when the 30-day
    //    period ends (current_period_end < now → downgrade to past_due →
    //    features resolve to delta_free).
    //
    //    trial_days=30 documents the intended duration (not enforced by a
    //    DB trigger; the application sets current_period_end = now + 30 days).
    //
    //    sort_order=99 places it after all public plans.
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      INSERT INTO plan_configs
        (id, plan_key, name, price, currency, trial_days, description,
         is_active, sort_order, role_key, is_permanent, created_at, updated_at)
      VALUES
        (gen_random_uuid(), 'free_trial', 'Free Trial', 0, 'USD', 30,
         'Prueba gratuita de 30 días con acceso completo. Asignada automáticamente al registrarse.',
         true, 99, 'doctor', false, NOW(), NOW())
      ON CONFLICT (plan_key) DO NOTHING
    `);

    // -----------------------------------------------------------------------
    // 3. Insert plan_features for free_trial — all features enabled,
    //    identical to delta_plus. Idempotent via ON CONFLICT DO NOTHING
    //    (plan_features has a unique constraint on (plan, feature_key)).
    // -----------------------------------------------------------------------
    const now = new Date();
    const featureRows = FEATURE_KEYS.map((featureKey) => ({
      plan: 'free_trial',
      feature_key: featureKey,
      feature_label: FEATURE_LABELS[featureKey],
      enabled: true,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('plan_features', featureRows, { ignoreDuplicates: true });
  },

  async down(queryInterface) {
    // -----------------------------------------------------------------------
    // Remove plan_features for free_trial
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      DELETE FROM plan_features WHERE plan = 'free_trial'
    `);

    // -----------------------------------------------------------------------
    // Remove plan_config for free_trial
    // -----------------------------------------------------------------------
    await queryInterface.sequelize.query(`
      DELETE FROM plan_configs WHERE plan_key = 'free_trial'
    `);

    // NOTE: The 'free_trial' value cannot be removed from the subscription_plan
    // enum (Postgres does not support DROP VALUE on an enum). Any subscription
    // rows that had plan='free_trial' before this down() runs should be
    // migrated manually or will retain the now-orphaned plan key.
    // This is an accepted trade-off for enum-based plan storage.
  },
};
