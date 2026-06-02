/**
 * Migration: 20260602000001-appointment-changes-log
 *
 * Creates the appointment_changes_log table for audit-trail of status transitions.
 * This is an append-only table: no UPDATE or DELETE; rows are written by
 * UpdateAppointmentStatusUseCase every time a status change is persisted.
 *
 * Spec: migracion/modulos/03-appointments.md
 *
 * Columns:
 *   id              uuid PK (gen_random_uuid())
 *   appointment_id  uuid NOT NULL FK → appointments(id) ON DELETE CASCADE
 *   actor_id        uuid NOT NULL (the doctor performing the transition)
 *   old_status      varchar(20) nullable (null on first status change from default)
 *   new_status      varchar(20) NOT NULL
 *   created_at      timestamptz NOT NULL default now()
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('appointment_changes_log', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      appointment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'appointments',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      actor_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      old_status: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      new_status: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });

    await queryInterface.addIndex('appointment_changes_log', ['appointment_id'], {
      name: 'idx_appt_changes_log_appointment_id',
    });

    // actor_id index supports audit queries: "which changes did this doctor make?"
    await queryInterface.addIndex('appointment_changes_log', ['actor_id'], {
      name: 'idx_appt_changes_log_actor_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('appointment_changes_log');
  },
};
