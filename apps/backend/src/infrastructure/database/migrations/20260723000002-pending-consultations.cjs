'use strict';

/**
 * Migration: 20260723000002-pending-consultations
 *
 * Adds support for "consultas por agendar" (pending consultations):
 *   1. ALTER TABLE pricing_plans  — adds validity_days (días de validez de sesiones en paquetes).
 *   2. ALTER TABLE patient_packages — adds expires_at (deadline para agendar sesiones restantes).
 *   3. CREATE TABLE pending_consultations — preconsultas generadas cuando un paciente
 *      compra un servicio con N sesiones y solo agenda la primera de inmediato.
 *
 * Indexes:
 *   (doctor_id, status)   — query principal del dashboard del doctor.
 *   (patient_id)          — queries del portal del paciente.
 *   (status, expires_at)  — cron de expiración automática.
 *   (package_id)          — joins desde patient_packages.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. pricing_plans: validity_days (días de validez para servicios con sessions_count > 1)
    await queryInterface.sequelize.query(`
      ALTER TABLE pricing_plans
        ADD COLUMN IF NOT EXISTS validity_days INTEGER NULL
    `);

    // 2. patient_packages: expires_at (deadline para usar sesiones restantes)
    await queryInterface.sequelize.query(`
      ALTER TABLE patient_packages
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL
    `);

    // 3. pending_consultations table
    await queryInterface.createTable('pending_consultations', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        allowNull: false,
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      patient_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      auth_user_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      package_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'patient_packages', key: 'id' },
        onDelete: 'SET NULL',
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      plan_name: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      office_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      appointment_mode: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      session_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      status: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: 'pending_scheduling',
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      scheduled_appointment_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      consultation_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      reminder_stage: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      last_reminder_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // CHECK constraint for status enum
    await queryInterface.sequelize.query(`
      ALTER TABLE pending_consultations
        ADD CONSTRAINT pending_consultations_status_check
        CHECK (status IN (
          'pending_scheduling',
          'scheduled',
          'completed',
          'expired',
          'cancelled'
        ))
    `);

    // Indexes
    await queryInterface.addIndex('pending_consultations', ['doctor_id', 'status'], {
      name: 'idx_pending_consultations_doctor_status',
    });

    await queryInterface.addIndex('pending_consultations', ['patient_id'], {
      name: 'idx_pending_consultations_patient_id',
    });

    await queryInterface.addIndex('pending_consultations', ['status', 'expires_at'], {
      name: 'idx_pending_consultations_status_expires',
    });

    await queryInterface.addIndex('pending_consultations', ['package_id'], {
      name: 'idx_pending_consultations_package_id',
      where: { package_id: { [Sequelize.Op.ne]: null } },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pending_consultations');

    await queryInterface.sequelize.query(`
      ALTER TABLE patient_packages
        DROP COLUMN IF EXISTS expires_at
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE pricing_plans
        DROP COLUMN IF EXISTS validity_days
    `);
  },
};
