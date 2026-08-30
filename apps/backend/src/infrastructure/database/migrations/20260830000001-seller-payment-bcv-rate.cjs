'use strict';

/**
 * Migration: 20260830000001-seller-payment-bcv-rate
 *
 * Adds `seller_payments.bcv_rate NUMERIC(18,4) NULL`.
 *
 * Rationale:
 *   Commissions are calculated and stored in USD. When an admin pays a seller the
 *   transfer is in bolívares (Pago Móvil / Transferencia), so the UI needs to show
 *   the bolivar equivalent. To avoid the "floating exchange rate" problem — where a
 *   historical payment shows an amount different from what the seller actually
 *   received — we snapshot the BCV rate at the moment the payment is registered.
 *
 *   NULL is intentional and has two valid meanings:
 *     1. Payments created before this migration (no rate was captured).
 *     2. Payments created after this migration when the BCV rate was unavailable.
 *
 *   A null bcv_rate must NEVER block a payment from being registered — it is only
 *   cosmetic information used by the frontend to display an estimate in Bs.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_payments
        ADD COLUMN IF NOT EXISTS bcv_rate NUMERIC(18,4) NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE seller_payments
        DROP COLUMN IF EXISTS bcv_rate
    `);
  },
};
