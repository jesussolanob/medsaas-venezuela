/**
 * Migration: 20260611000009-office-id-on-pricing-plans-and-appointments
 *
 * Adds office_id FK to pricing_plans and appointments tables so that:
 *   - A doctor's service (pricing plan) can be tied to a specific office.
 *     NULL = "general" plan applicable to all offices (backward compatible).
 *   - An appointment can record which office it was booked at.
 *     NULL = not yet captured / legacy row.
 *
 * Both columns are nullable to preserve all existing rows without alteration.
 *
 * Indexes:
 *   - pricing_plans(doctor_id, office_id) — supports the filtered list query
 *   - appointments(office_id)            — supports future office-scoped reporting
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ------------------------------------------------------------------ 1/4
    // Add office_id to pricing_plans
    // ------------------------------------------------------------------ 1/4
    await queryInterface.addColumn('pricing_plans', 'office_id', {
      type: Sequelize.UUID,
      allowNull: true,
      defaultValue: null,
      references: {
        model: 'doctor_offices',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    // ------------------------------------------------------------------ 2/4
    // Composite index: doctor-scoped plan listing filtered by office
    // ------------------------------------------------------------------ 2/4
    await queryInterface.addIndex('pricing_plans', ['doctor_id', 'office_id'], {
      name: 'idx_pricing_plans_doctor_office',
    });

    // ------------------------------------------------------------------ 3/4
    // Add office_id to appointments
    // ------------------------------------------------------------------ 3/4
    await queryInterface.addColumn('appointments', 'office_id', {
      type: Sequelize.UUID,
      allowNull: true,
      defaultValue: null,
      references: {
        model: 'doctor_offices',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    // ------------------------------------------------------------------ 4/4
    // Index for future office-scoped appointment reporting
    // ------------------------------------------------------------------ 4/4
    await queryInterface.addIndex('appointments', ['office_id'], {
      name: 'idx_appointments_office_id',
      where: { office_id: { [Sequelize.Op.ne]: null } },
    });
  },

  async down(queryInterface) {
    // Reverse order: remove indexes first, then columns.

    await queryInterface.removeIndex('appointments', 'idx_appointments_office_id');
    await queryInterface.removeColumn('appointments', 'office_id');

    await queryInterface.removeIndex('pricing_plans', 'idx_pricing_plans_doctor_office');
    await queryInterface.removeColumn('pricing_plans', 'office_id');
  },
};
