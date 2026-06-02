/**
 * Migration: 20260602000004-finances
 *
 * Creates two tables:
 *   1. financial_transactions — manual income and expense entries per doctor.
 *   2. app_settings — key/value store for application-wide settings (e.g. usdt_rate).
 *
 * Spec: migracion/modulos/06-finances.md + migracion/03b-schema-real.md (finances section)
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. financial_transactions
    await queryInterface.createTable('financial_transactions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD',
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      related_consultation_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'consultations', key: 'id' },
        onDelete: 'SET NULL',
      },
      transaction_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    // CHECK constraint: type must be 'income' or 'expense'
    await queryInterface.sequelize.query(
      `ALTER TABLE financial_transactions
         ADD CONSTRAINT financial_transactions_type_check
         CHECK (type IN ('income','expense'))`,
    );

    // Index on (doctor_id, transaction_date) for summary queries
    await queryInterface.addIndex('financial_transactions', ['doctor_id', 'transaction_date'], {
      name: 'idx_financial_transactions_doctor_date',
    });

    // 2. app_settings
    await queryInterface.createTable('app_settings', {
      key: {
        type: Sequelize.TEXT,
        primaryKey: true,
        allowNull: false,
      },
      value: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('app_settings');
    await queryInterface.dropTable('financial_transactions');
  },
};
