'use strict';

/**
 * Migration: doctor checkout — extend subscription_payments table.
 *
 * Adds columns needed for the doctor self-service payment flow:
 *
 *   amount_bs        — amount in bolívares (server-calculated, never trusted from client)
 *   bcv_rate_used    — effective BCV rate at submission time (4 decimal places)
 *   bank_code        — Venezuelan bank institution code (4-digit catalog)
 *   receipt_url      — GCS object path (NOT a signed URL; sign on demand via STORAGE_PORT)
 *   notes            — optional doctor notes on the payment
 *   plan_key         — which plan the doctor is paying for (may differ from current plan)
 *   period           — billing period: monthly | quarterly | semiannual | annual
 *   rejection_reason — persisted reason when a super_admin rejects the payment
 *
 * All columns are nullable for backward compatibility with existing rows.
 *
 * Also creates a composite index on (doctor_id, status) for efficient
 * per-doctor payment queries.
 *
 * Seeds the 'platform_payment_instructions' app_settings key with a default
 * Spanish text that the super_admin can customise from /admin/settings.
 *
 * Also closes a race condition in the "one pending payment per doctor"
 * anti-spam rule (SubmitDoctorPaymentUseCase): the application-level check
 * (findPendingByDoctor + saveDoctorPayment, no lock) allows two concurrent
 * requests from the same doctor to both pass the check and insert a pending
 * row. Step 4 below cleans up any pre-existing duplicate 'pending' rows
 * (keeping only the most recent per doctor) so step 5's unique partial index
 * does not fail against real data in staging/production.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // 1. Add new columns — all nullable (retrocompatible with existing rows).
    await queryInterface.sequelize.query(`
      ALTER TABLE subscription_payments
        ADD COLUMN IF NOT EXISTS amount_bs        NUMERIC(14, 2),
        ADD COLUMN IF NOT EXISTS bcv_rate_used    NUMERIC(14, 4),
        ADD COLUMN IF NOT EXISTS bank_code        TEXT,
        -- Stores the GCS object path, NOT a signed URL. Sign on demand via STORAGE_PORT.
        ADD COLUMN IF NOT EXISTS receipt_url      TEXT,
        ADD COLUMN IF NOT EXISTS notes            TEXT,
        ADD COLUMN IF NOT EXISTS plan_key         TEXT,
        ADD COLUMN IF NOT EXISTS period           TEXT,
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    `);

    // 2. Composite index for per-doctor payment queries (pending / history).
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_subscription_payments_doctor_status
        ON subscription_payments (doctor_id, status)
    `);

    // 3. Seed default payment instructions.
    //    Super admin can customise this from /admin/settings (generic key/value editor).
    //    ON CONFLICT DO NOTHING — never overwrite a value that was already customised.
    await queryInterface.sequelize.query(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (
        'platform_payment_instructions',
        'Realice su transferencia bancaria o pago móvil y adjunte el comprobante aquí. Datos de pago: Banco: Mercantil · RIF: J-000000000-0 · Beneficiario: Delta Medical CRM, C.A. Incluya su número de cédula como concepto de pago para identificar la transacción.',
        NOW()
      )
      ON CONFLICT (key) DO NOTHING
    `);

    // 4. Resolve any pre-existing duplicate 'pending' rows per doctor BEFORE
    //    creating the unique partial index below — otherwise the CREATE UNIQUE
    //    INDEX would fail against real data and block every future deploy
    //    (migrations run before the build). Keeps the most recent pending row
    //    per doctor; the rest are marked 'rejected' with an explanatory reason.
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY doctor_id
                 ORDER BY created_at DESC, id DESC
               ) AS rn
          FROM subscription_payments
         WHERE status = 'pending'
      )
      UPDATE subscription_payments sp
         SET status = 'rejected',
             rejection_reason = 'Rechazado automáticamente por una migración de limpieza: existía más de un pago pendiente simultáneo para este doctor. Se conservó únicamente el más reciente.',
             reviewed_at = NOW(),
             updated_at = NOW()
        FROM ranked r
       WHERE sp.id = r.id
         AND r.rn > 1
    `);

    // 5. Unique partial index — the real anti-spam guard. Makes it impossible
    //    for two 'pending' rows to exist for the same doctor even under a race
    //    (the application-level findPendingByDoctor() check is now a fast-path
    //    optimisation only, not the sole guard).
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_payments_one_pending_per_doctor
        ON subscription_payments (doctor_id)
       WHERE status = 'pending'
    `);
  },

  async down(queryInterface) {
    // Remove in reverse order. The app_settings seed is NOT removed on rollback
    // because it may have been customised by the admin — the key is safe to leave.
    // Step 4's cleanup (rejecting duplicate pending rows) is NOT reversible —
    // there is no record of which rows were originally pending before the
    // migration ran, and leaving them rejected is safe either way.
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS uq_subscription_payments_one_pending_per_doctor
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_subscription_payments_doctor_status
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE subscription_payments
        DROP COLUMN IF EXISTS rejection_reason,
        DROP COLUMN IF EXISTS period,
        DROP COLUMN IF EXISTS plan_key,
        DROP COLUMN IF EXISTS notes,
        DROP COLUMN IF EXISTS receipt_url,
        DROP COLUMN IF EXISTS bank_code,
        DROP COLUMN IF EXISTS bcv_rate_used,
        DROP COLUMN IF EXISTS amount_bs
    `);
  },
};
