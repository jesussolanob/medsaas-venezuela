/**
 * Migration: 20260602000005-doctor-schedules
 *
 * Creates the `doctor_schedules` table.
 * Stores the weekly schedule configuration per doctor.
 *
 * doctor_id is the primary key and a unique FK to profiles(id).
 * One row per doctor (upsert pattern).
 *
 * Spec: migracion/modulos/09-doctor-settings.md
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('doctor_schedules', {
      doctor_id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        references: { model: 'profiles', key: 'id' },
        onDelete: 'CASCADE',
      },
      work_days: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        allowNull: false,
        defaultValue: [1, 2, 3, 4, 5],
      },
      start_time: {
        type: Sequelize.STRING(5),
        allowNull: false,
        defaultValue: '08:00',
      },
      end_time: {
        type: Sequelize.STRING(5),
        allowNull: false,
        defaultValue: '17:00',
      },
      slot_duration_minutes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30,
      },
      break_start: {
        type: Sequelize.STRING(5),
        allowNull: true,
      },
      break_end: {
        type: Sequelize.STRING(5),
        allowNull: true,
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

    // Index on doctor_id for FK lookups (PK already creates one, but explicit for clarity)
    await queryInterface.addIndex('doctor_schedules', ['doctor_id'], {
      name: 'idx_doctor_schedules_doctor_id',
      unique: true,
    });
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('doctor_schedules');
  },
};
