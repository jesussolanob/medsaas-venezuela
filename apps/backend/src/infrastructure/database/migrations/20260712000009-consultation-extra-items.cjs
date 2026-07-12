/**
 * Migration: 20260712000009-consultation-extra-items
 *
 * Changes:
 *   1. Adds `base_amount` (NUMERIC 12,2, nullable) to `consultations`.
 *      Purpose: stores the immutable base price of the consultation so that
 *      re-approving with edited extras does not accumulate on a total that already
 *      includes a previous extras sum. On first approval, `base_amount` is set to
 *      the consultation's `amount` at that moment (or plan_price fallback). On every
 *      subsequent approval, `total = base_amount + SUM(extras)` — never `amount + extras`.
 *
 *   2. Creates the `consultation_extra_items` table:
 *      - id              UUID PK (gen_random_uuid())
 *      - consultation_id UUID FK → consultations(id) ON DELETE CASCADE
 *      - doctor_id       UUID NOT NULL  (anti-IDOR: always scoped to the doctor)
 *      - description     TEXT NOT NULL  (e.g. "Limpieza dental")
 *      - amount_usd      NUMERIC(12,2) NOT NULL CHECK > 0
 *      - created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *
 *      No updated_at: items are replace-all (delete then insert) — they are not
 *      individually updated after creation.
 *
 *   3. Adds index `idx_consultation_extra_items_consultation_id` on (consultation_id)
 *      for efficient lookup when loading a consultation's extras.
 *
 * down():
 *   Drops the table (CASCADE removes the index) then drops the base_amount column.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // -----------------------------------------------------------------------
    // 1. Add base_amount to consultations
    // -----------------------------------------------------------------------
    await queryInterface.addColumn('consultations', 'base_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: null,
    });

    // -----------------------------------------------------------------------
    // 2. Create consultation_extra_items table
    // -----------------------------------------------------------------------
    await queryInterface.createTable('consultation_extra_items', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      consultation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'consultations',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      doctor_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      amount_usd: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Enforce amount_usd > 0 at the DB level
    await queryInterface.sequelize.query(
      `ALTER TABLE consultation_extra_items
         ADD CONSTRAINT chk_extra_item_amount_positive CHECK (amount_usd > 0)`,
    );

    // -----------------------------------------------------------------------
    // 3. Index for efficient per-consultation lookup
    // -----------------------------------------------------------------------
    await queryInterface.addIndex('consultation_extra_items', ['consultation_id'], {
      name: 'idx_consultation_extra_items_consultation_id',
    });
  },

  async down(queryInterface) {
    // Drop child table first (removes FK and index via DROP TABLE)
    await queryInterface.dropTable('consultation_extra_items');

    // Remove base_amount column from consultations
    await queryInterface.removeColumn('consultations', 'base_amount');
  },
};
