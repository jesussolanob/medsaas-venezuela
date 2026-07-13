/**
 * Migration: 20260712000012-free-trial-mirror-delta-plus-features
 *
 * WHY: the free_trial plan must behave EXACTLY like delta_plus (only capped to
 * ~30 days by the lazy-downgrade path). Its original seed (20260712000007) used
 * a hardcoded list of 17 feature keys that did NOT include the 'booking' key
 * (public online booking), which is provisioned live via /admin/plan-features
 * and therefore never existed in code. As a result, doctors on free_trial were
 * missing the public online-booking feature that delta_plus has.
 *
 * FIX (idempotent): mirror EVERY plan_features row of delta_plus into free_trial,
 * upserting `enabled`/`feature_label` on the (plan, feature_key) unique key. This
 * copies whatever delta_plus currently has — including 'booking' and any other
 * key added live — so free_trial stays a faithful mirror of delta_plus.
 *
 * The 1-month cap is unchanged: free_trial plan_config keeps is_permanent=false
 * and trial_days=30; the lazy-downgrade resolves expired trials to delta_free.
 *
 * down(): no-op. We do not remove mirrored rows because that would silently
 * re-break online booking for existing free_trial doctors. Reversal, if ever
 * needed, is a manual data decision.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO plan_features (id, plan, feature_key, feature_label, enabled, created_at, updated_at)
      SELECT gen_random_uuid(), 'free_trial', pf.feature_key, pf.feature_label, pf.enabled, NOW(), NOW()
      FROM plan_features pf
      WHERE pf.plan = 'delta_plus'
      ON CONFLICT (plan, feature_key)
      DO UPDATE SET
        enabled       = EXCLUDED.enabled,
        feature_label = EXCLUDED.feature_label,
        updated_at    = NOW();
    `);
  },

  async down() {
    // Intentionally a no-op — see file header. Removing the mirrored rows would
    // re-break online booking for free_trial doctors.
  },
};
