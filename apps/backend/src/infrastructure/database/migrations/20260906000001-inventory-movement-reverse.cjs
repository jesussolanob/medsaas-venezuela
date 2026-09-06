'use strict';

/**
 * Migration: 20260906000001-inventory-movement-reverse
 *
 * Adds reversal tracking to the inventory_movements ledger:
 *
 *   1. Column `reverses_movement_id UUID NULL` — references the original movement
 *      that this entry reverses. NULL for all existing / non-reversal movements.
 *
 *   2. Unique partial index on (reverses_movement_id) WHERE NOT NULL — the DB
 *      enforces that each movement can be reversed at most once without adding
 *      a flag column to the original row (append-only ledger pattern).
 *
 * No existing rows are affected: the column is nullable and has no default.
 *
 * Idempotent: uses ADD COLUMN IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // 1. Add the nullable foreign key column.
    await q.query(`
      ALTER TABLE inventory_movements
        ADD COLUMN IF NOT EXISTS reverses_movement_id UUID NULL
          REFERENCES inventory_movements(id) ON DELETE SET NULL
    `);

    // 2. Unique partial index: prevents a movement from being reversed twice.
    //    The WHERE clause means the index only covers reversal rows, keeping
    //    writes on regular movements free of additional index overhead.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_inventory_movements_reverses_movement_id
        ON inventory_movements (reverses_movement_id)
        WHERE reverses_movement_id IS NOT NULL
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Drop the index first (it references the column we are about to drop).
    await q.query(`
      DROP INDEX IF EXISTS uidx_inventory_movements_reverses_movement_id
    `);

    await q.query(`
      ALTER TABLE inventory_movements
        DROP COLUMN IF EXISTS reverses_movement_id
    `);
  },
};
