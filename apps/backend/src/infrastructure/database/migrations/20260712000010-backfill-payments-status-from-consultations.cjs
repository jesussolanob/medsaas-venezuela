'use strict';

/**
 * Migration: backfill payments.status from consultations.payment_status
 *
 * Problem: when a doctor approved/edited a payment from the Consultation view,
 * consultations.payment_status was updated but the linked payments row was not.
 * This left Cobros showing all rows as "pending" even after approval.
 *
 * Fix: for every consultation where payment_status='approved' whose linked
 * payments row is still 'pending', update the payments row to match.
 *
 * Only touches rows that are genuinely inconsistent (WHERE pp.status='pending').
 * Idempotent: safe to run multiple times.
 *
 * down(): documented no-op — reversing a backfill would corrupt live data.
 */

/** @type {import('sequelize').QueryInterface} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(
        `UPDATE payments pp
            SET status     = 'approved',
                paid_at    = COALESCE(c.payment_date, pp.paid_at, now()),
                amount_usd = COALESCE(NULLIF(c.amount, 0), pp.amount_usd),
                updated_at = now()
           FROM appointments ap
           JOIN consultations c ON c.id = ap.consultation_id
          WHERE ap.payment_id          = pp.id
            AND c.payment_status       = 'approved'
            AND pp.status              = 'pending'`,
        { transaction: t },
      );
    });
  },

  async down(_queryInterface) {
    // Intentional no-op.
    // Reversing a backfill that marks payments as 'approved' would mean
    // marking legitimately-received payments as pending — unsafe for financial data.
    // To roll back manually, restore from a pre-migration database backup.
  },
};
