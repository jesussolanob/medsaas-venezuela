/**
 * Migration: 20260603000001-payments-and-items
 *
 * Creates:
 *   1. `payments`      — financial source of truth (per-doctor, per-appointment)
 *   2. `payment_items` — line items attached to a payment (ON DELETE CASCADE)
 *
 * Also adds:
 *   - `appointments.payment_id` nullable FK → payments(id)
 *
 * The payments table is the SINGLE source of truth for doctor income.
 * Derived columns (consultations.payment_status, appointments.status) are
 * sync'd by the application layer — never read for financial aggregations.
 *
 * Spec: apps/frontend/lib/finances.ts + apps/frontend/app/doctor/cobros/page.tsx
 *
 * NOTE: All DDL uses IF NOT EXISTS / DO blocks for idempotency in case
 * a prior partial run left the schema in an intermediate state.
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    // ------------------------------------------------------------------
    // 1. payments
    // ------------------------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                  uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
        doctor_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        patient_id          uuid        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        amount_usd          numeric(12,2) NOT NULL DEFAULT 0,
        amount_bs           numeric(14,2) NULL,
        bcv_rate            numeric(12,4) NULL,
        currency            text        NOT NULL DEFAULT 'USD',
        method_snapshot     text        NULL,
        payment_reference   text        NULL,
        payment_receipt_url text        NULL,
        payment_code        text        NULL,
        status              text        NOT NULL DEFAULT 'pending'
                              CONSTRAINT payments_status_check CHECK (status IN ('pending','approved')),
        paid_at             timestamptz NULL,
        package_id          uuid        NULL REFERENCES patient_packages(id) ON DELETE SET NULL,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_doctor_created ON payments (doctor_id, created_at DESC)
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status)
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON payments (patient_id)
    `);

    // ------------------------------------------------------------------
    // 2. payment_items
    // ------------------------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS payment_items (
        id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_id  uuid        NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
        doctor_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name        text        NOT NULL,
        amount_usd  numeric(12,2) NOT NULL,
        source_type text        NULL,
        source_id   uuid        NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_items_payment_id ON payment_items (payment_id)
    `);

    // ------------------------------------------------------------------
    // 3. appointments.payment_id (FK → payments)
    // ------------------------------------------------------------------
    await q.query(`
      ALTER TABLE appointments
        ADD COLUMN IF NOT EXISTS payment_id uuid NULL
    `);

    await q.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'appointments_payment_id_fkey'
            AND table_name      = 'appointments'
        ) THEN
          ALTER TABLE appointments
            ADD CONSTRAINT appointments_payment_id_fkey
            FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;
        END IF;
      END;
      $$
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    // Revert in reverse dependency order
    await q.query(`
      ALTER TABLE appointments
        DROP CONSTRAINT IF EXISTS appointments_payment_id_fkey
    `);
    await q.query(`
      ALTER TABLE appointments
        DROP COLUMN IF EXISTS payment_id
    `);
    await q.query(`DROP TABLE IF EXISTS payment_items`);
    await q.query(`DROP TABLE IF EXISTS payments`);
  },
};
