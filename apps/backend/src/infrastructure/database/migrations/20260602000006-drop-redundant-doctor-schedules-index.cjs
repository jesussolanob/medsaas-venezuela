/**
 * Migration: 20260602000006-drop-redundant-doctor-schedules-index
 *
 * Drops idx_doctor_schedules_doctor_id, which was created in migration 000005.
 * That index is redundant because doctor_id is the PRIMARY KEY — PostgreSQL
 * automatically creates a unique B-tree index for every PK constraint.
 *
 * Having two identical unique indexes on the same column wastes space and
 * adds write overhead on every UPSERT without providing any additional benefit.
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    await queryInterface.removeIndex('doctor_schedules', 'idx_doctor_schedules_doctor_id');
  },

  async down(queryInterface, _Sequelize) {
    // Restore the (redundant) index so rolling back to 000005 state is clean.
    await queryInterface.addIndex('doctor_schedules', ['doctor_id'], {
      name: 'idx_doctor_schedules_doctor_id',
      unique: true,
    });
  },
};
