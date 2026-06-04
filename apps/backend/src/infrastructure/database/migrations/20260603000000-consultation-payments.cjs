/**
 * Migration: 20260603000000-consultation-payments
 *
 * Creates the `consultation_payments` table to track individual payment events
 * for consultations.
 *
 * Relationship: consultation_payments → consultations (CASCADE DELETE)
 *               consultation_payments → profiles (doctor_id, approved_by)
 *               consultation_payments → patients (patient_id)
 *
 * Spec: apps/frontend/app/api/doctor/payments/route.ts (original implementation)
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('consultation_payments', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
      },
      consultation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'consultations', key: 'id' },
        onDelete: 'CASCADE',
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      patient_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'patients', key: 'id' },
        onDelete: 'CASCADE',
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'USD',
      },
      payment_method: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      reference_number: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      receipt_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'pending',
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // CHECK constraint: status must be one of the allowed values
    await queryInterface.sequelize.query(
      `ALTER TABLE consultation_payments
         ADD CONSTRAINT consultation_payments_status_check
         CHECK (status IN ('pending','approved','rejected'))`,
    );

    // Index: (doctor_id, created_at DESC) — primary query pattern for list endpoint
    await queryInterface.addIndex('consultation_payments', ['doctor_id', 'created_at'], {
      name: 'idx_consultation_payments_doctor_created',
    });

    // Index: (consultation_id) — filter by consultation
    await queryInterface.addIndex('consultation_payments', ['consultation_id'], {
      name: 'idx_consultation_payments_consultation_id',
    });

    // Index: (status) — filter by status
    await queryInterface.addIndex('consultation_payments', ['status'], {
      name: 'idx_consultation_payments_status',
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('consultation_payments');
  },
};
