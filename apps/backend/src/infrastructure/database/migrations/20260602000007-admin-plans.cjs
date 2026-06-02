/**
 * Migration: 20260602000007-admin-plans
 *
 * NOTE: plan_configs and plan_features were already created by
 * 20260602000000-initial-schema.cjs (T-02 and T-03 in spec 03b-schema-real.md).
 *
 * This migration seeds the default plan_configs rows if they do not exist yet.
 * Using INSERT ... ON CONFLICT DO NOTHING for idempotency.
 *
 * Spec: migracion/modulos/08-admin.md + migracion/03b-schema-real.md (T-02, T-03)
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    // Seed default plan_configs using raw SQL for ON CONFLICT DO NOTHING support
    await queryInterface.sequelize.query(`
      INSERT INTO plan_configs (id, plan_key, name, price, currency, trial_days, description, is_active, sort_order, created_at, updated_at)
      VALUES
        ('00000000-0000-0000-0000-000000000001', 'trial',        'Trial',        0,   'USD', 14, 'Período de prueba gratuito de 14 días', true, 0, NOW(), NOW()),
        ('00000000-0000-0000-0000-000000000002', 'basic',        'Basic',        10,  'USD', 0,  'Plan básico para médicos individuales', true, 1, NOW(), NOW()),
        ('00000000-0000-0000-0000-000000000003', 'professional', 'Professional', 30,  'USD', 0,  'Plan profesional con todas las funcionalidades', true, 2, NOW(), NOW()),
        ('00000000-0000-0000-0000-000000000004', 'clinic',       'Clinic',       100, 'USD', 0,  'Plan para clínicas y grupos médicos', true, 3, NOW(), NOW())
      ON CONFLICT (plan_key) DO NOTHING
    `);
  },

  async down(queryInterface, _Sequelize) {
    // Remove only the seed rows added by this migration
    await queryInterface.sequelize.query(`
      DELETE FROM plan_configs WHERE plan_key IN ('trial', 'basic', 'professional', 'clinic')
    `);
  },
};
