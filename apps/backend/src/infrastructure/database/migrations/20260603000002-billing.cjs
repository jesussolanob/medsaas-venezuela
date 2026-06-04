/**
 * Migration: 20260603000002-billing
 *
 * Creates 4 tables for the billing module:
 *   1. subscription_payments  — platform subscription payment submissions
 *   2. invoices               — platform invoices issued to doctors
 *   3. billing_documents      — fiscal documents (facturas, notas, recibos) per doctor
 *   4. subscription_changes_log — immutable audit trail for subscription lifecycle
 *
 * All DDL uses IF NOT EXISTS for idempotency.
 * down() reverts in reverse dependency order (no cross-table FKs between billing tables).
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    // ------------------------------------------------------------------
    // 1. subscription_payments
    // ------------------------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS subscription_payments (
        id               uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
        doctor_id        uuid           NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        amount_usd       numeric(12,2)  NOT NULL,
        method           text           NOT NULL,
        reference_number text           NULL,
        duration_months  int            NOT NULL DEFAULT 1,
        status           text           NOT NULL DEFAULT 'pending'
                           CONSTRAINT subscription_payments_status_check
                           CHECK (status IN ('pending','approved','rejected')),
        reviewed_by      uuid           NULL REFERENCES profiles(id) ON DELETE SET NULL,
        reviewed_at      timestamptz    NULL,
        created_at       timestamptz    NOT NULL DEFAULT now(),
        updated_at       timestamptz    NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_subscription_payments_doctor_id
        ON subscription_payments (doctor_id)
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_subscription_payments_status
        ON subscription_payments (status)
    `);

    // ------------------------------------------------------------------
    // 2. invoices
    // ------------------------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id             uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
        doctor_id      uuid          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        invoice_number text          NOT NULL UNIQUE,
        amount         numeric(12,2) NOT NULL,
        currency       text          NOT NULL DEFAULT 'USD',
        description    text          NULL,
        status         text          NOT NULL DEFAULT 'issued'
                         CONSTRAINT invoices_status_check
                         CHECK (status IN ('issued','sent','paid')),
        issued_at      timestamptz   NULL,
        sent_at        timestamptz   NULL,
        paid_at        timestamptz   NULL,
        created_by     uuid          NULL REFERENCES profiles(id) ON DELETE SET NULL,
        created_at     timestamptz   NOT NULL DEFAULT now(),
        updated_at     timestamptz   NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_doctor_id
        ON invoices (doctor_id)
    `);

    // ------------------------------------------------------------------
    // 3. billing_documents
    // ------------------------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS billing_documents (
        id              uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
        doc_number      text           NOT NULL,
        doc_type        text           NOT NULL,
        doctor_id       uuid           NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        consultation_id uuid           NULL,
        payment_id      uuid           NULL,
        patient_id      uuid           NULL,
        items           jsonb          NOT NULL DEFAULT '[]',
        subtotal        numeric(14,2)  NULL,
        total           numeric(14,2)  NOT NULL,
        iva_amount      numeric(14,2)  NOT NULL DEFAULT 0,
        igtf_amount     numeric(14,2)  NOT NULL DEFAULT 0,
        bcv_rate        numeric(12,4)  NULL,
        total_bs        numeric(16,2)  NULL,
        notes           text           NULL,
        currency        text           NOT NULL DEFAULT 'USD',
        status          text           NOT NULL DEFAULT 'issued',
        created_at      timestamptz    NOT NULL DEFAULT now(),
        updated_at      timestamptz    NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_billing_documents_doctor_created
        ON billing_documents (doctor_id, created_at DESC)
    `);

    // ------------------------------------------------------------------
    // 4. subscription_changes_log
    // ------------------------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS subscription_changes_log (
        id                      uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
        doctor_id               uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        action                  text        NOT NULL,
        actor_id                uuid        NULL,
        actor_role              text        NULL,
        reason                  text        NULL,
        subscription_expires_at timestamptz NULL,
        metadata                jsonb       NULL,
        created_at              timestamptz NOT NULL DEFAULT now()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_subscription_changes_log_doctor_created
        ON subscription_changes_log (doctor_id, created_at DESC)
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    // Revert in reverse order (no cross-billing-table FKs, so order is simple)
    await q.query(`DROP TABLE IF EXISTS subscription_changes_log`);
    await q.query(`DROP TABLE IF EXISTS billing_documents`);
    await q.query(`DROP TABLE IF EXISTS invoices`);
    await q.query(`DROP TABLE IF EXISTS subscription_payments`);
  },
};
