'use strict';

/**
 * Migration: backfill subscriptions table for doctors that lack a row.
 *
 * Background:
 *   The subscriptions table was never written at doctor registration — all write
 *   paths used UPDATE, which silently no-oped when the row did not exist.
 *   As a result the table may be entirely empty while profiles.plan /
 *   profiles.subscription_status hold the only subscription state.
 *
 * What this migration does:
 *   For every doctor profile that does NOT already have a subscriptions row,
 *   inserts one that mirrors the existing profile snapshot:
 *
 *     plan              = COALESCE(profiles.plan, 'delta_free')
 *     status            = COALESCE(profiles.subscription_status, 'active')
 *     current_period_end = COALESCE(profiles.subscription_expires_at,
 *                                   NOW() + INTERVAL '100 years')
 *     current_period_start = NOW()
 *     price_usd         = 0
 *     id                = gen_random_uuid()
 *     created_at / updated_at = NOW()
 *
 * Idempotency:
 *   Uses ON CONFLICT (doctor_id) DO NOTHING so re-running the migration is safe.
 *   The INSERT only selects profiles that have NO existing subscription row.
 *
 * Rollback (down):
 *   No-op — deleting subscriptions could erase billing-relevant data.
 *   To undo: restore from a backup taken before the migration was run.
 */

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO subscriptions (
        id,
        doctor_id,
        plan,
        status,
        price_usd,
        billing_cycle,
        current_period_start,
        current_period_end,
        trial_ends_at,
        cancelled_at,
        notes,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid()                                                           AS id,
        p.id                                                                        AS doctor_id,
        COALESCE(p.plan::text,                 'delta_free')::subscription_plan     AS plan,
        COALESCE(p.subscription_status::text,  'active')::subscription_status      AS status,
        0                                                                           AS price_usd,
        NULL                                                                        AS billing_cycle,
        NOW()                                                                       AS current_period_start,
        COALESCE(p.subscription_expires_at,    NOW() + INTERVAL '100 years')       AS current_period_end,
        NULL                                                                        AS trial_ends_at,
        NULL                                                                        AS cancelled_at,
        NULL                                                                        AS notes,
        NOW()                                                                       AS created_at,
        NOW()                                                                       AS updated_at
      FROM profiles p
      WHERE p.role = 'doctor'
        AND NOT EXISTS (
          SELECT 1 FROM subscriptions s WHERE s.doctor_id = p.id
        )
      ON CONFLICT (doctor_id) DO NOTHING
    `);
  },

  async down(_queryInterface) {
    // Intentional no-op.
    // Deleting backfilled subscriptions rows could destroy billing history.
    // To reverse: restore from a pre-migration database backup.
  },
};
