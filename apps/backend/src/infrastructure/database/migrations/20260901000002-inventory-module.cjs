'use strict';

/**
 * Migration: 20260901000002-inventory-module
 *
 * Creates the full schema for the Inventory module. Five parts:
 *
 *   1. `products`               — catalog of sellable items per doctor
 *   2. `inventory_movements`    — double-entry ledger (purchase, sale, adjustment, loss)
 *   3. ALTER consultation_extra_items — add product_id, quantity, unit_price_usd
 *   4. role_capabilities seed  — doctor can view/create/edit/delete inventory
 *   5. plan_features seed       — every plan gets a row; delta_plus + free_trial = enabled
 *
 * Idempotent: all CREATE TABLE and ALTER use IF NOT EXISTS / IF NOT EXISTS guards.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // ── Part 1: products ──────────────────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS products (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        doctor_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name                TEXT        NOT NULL,
        description         TEXT        NOT NULL DEFAULT '',
        supplier            TEXT        NULL,
        photo_path          TEXT        NULL,
        sale_price_amount   NUMERIC(12,2) NOT NULL CHECK (sale_price_amount >= 0),
        sale_price_currency TEXT        NOT NULL DEFAULT 'USD'
                              CHECK (sale_price_currency IN ('USD', 'VES')),
        stock_qty           NUMERIC(12,2) NOT NULL DEFAULT 0,
        low_stock_threshold NUMERIC(12,2) NULL,
        is_active           BOOLEAN     NOT NULL DEFAULT true,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_products_doctor_id
        ON products (doctor_id)
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_products_doctor_id_is_active
        ON products (doctor_id, is_active)
    `);

    // ── Part 2: inventory_movements ───────────────────────────────────────────
    await q.query(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        doctor_id       UUID        NOT NULL,
        product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        kind            TEXT        NOT NULL
                          CHECK (kind IN ('purchase', 'sale', 'adjustment', 'loss')),
        qty             NUMERIC(12,2) NOT NULL CHECK (qty <> 0),
        unit_price_usd  NUMERIC(12,2) NULL,
        rate_used       NUMERIC(12,4) NULL,
        rate_source     TEXT        NULL,
        consultation_id UUID        NULL REFERENCES consultations(id) ON DELETE SET NULL,
        note            TEXT        NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_doctor_product
        ON inventory_movements (doctor_id, product_id)
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_consultation_id
        ON inventory_movements (consultation_id)
        WHERE consultation_id IS NOT NULL
    `);

    // ── Part 3: ALTER consultation_extra_items ────────────────────────────────
    await q.query(`
      ALTER TABLE consultation_extra_items
        ADD COLUMN IF NOT EXISTS product_id     UUID        NULL
          REFERENCES products(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS quantity       NUMERIC(12,2) NOT NULL DEFAULT 1
          CHECK (quantity > 0),
        ADD COLUMN IF NOT EXISTS unit_price_usd NUMERIC(12,2) NULL
    `);

    // ── Part 4: role_capabilities — doctor × inventory ────────────────────────
    // Pattern copied from 20260816000001-seller-role.cjs:86
    await q.query(`
      INSERT INTO role_capabilities
        (id, role, module_key, action, allowed, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), 'doctor', 'inventory', 'view',   true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'inventory', 'create', true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'inventory', 'edit',   true, now(), now()),
        (uuid_generate_v4(), 'doctor', 'inventory', 'delete', true, now(), now())
      ON CONFLICT (role, module_key, action)
      DO UPDATE SET
        allowed    = EXCLUDED.allowed,
        updated_at = now()
    `);

    // ── Part 5: plan_features — one row per plan, no exceptions ──────────────
    // Without a row, planUnlocks() returns false and the module is invisible
    // in /admin/plan-features. The migration of the free_trial mirror already ran
    // but the inventory feature was not seeded then, so we insert it manually.
    await q.query(`
      INSERT INTO plan_features
        (id, plan, feature_key, feature_label, enabled, created_at, updated_at)
      VALUES
        (uuid_generate_v4(), 'delta_plus',     'inventory', 'Inventario', true,  now(), now()),
        (uuid_generate_v4(), 'free_trial',     'inventory', 'Inventario', true,  now(), now()),
        (uuid_generate_v4(), 'delta_base',     'inventory', 'Inventario', false, now(), now()),
        (uuid_generate_v4(), 'delta_free',     'inventory', 'Inventario', false, now(), now()),
        (uuid_generate_v4(), 'trial',          'inventory', 'Inventario', false, now(), now()),
        (uuid_generate_v4(), 'basic',          'inventory', 'Inventario', false, now(), now()),
        (uuid_generate_v4(), 'professional',   'inventory', 'Inventario', false, now(), now()),
        (uuid_generate_v4(), 'clinic',         'inventory', 'Inventario', false, now(), now())
      ON CONFLICT (plan, feature_key)
      DO UPDATE SET
        enabled       = EXCLUDED.enabled,
        feature_label = EXCLUDED.feature_label,
        updated_at    = now()
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Reverse order from up()

    // 5. Remove plan_features rows
    await q.query(`
      DELETE FROM plan_features WHERE feature_key = 'inventory'
    `);

    // 4. Remove role_capabilities rows
    await q.query(`
      DELETE FROM role_capabilities
       WHERE module_key = 'inventory' AND role = 'doctor'
    `);

    // 3. Remove columns from consultation_extra_items
    await q.query(`
      ALTER TABLE consultation_extra_items
        DROP COLUMN IF EXISTS unit_price_usd,
        DROP COLUMN IF EXISTS quantity,
        DROP COLUMN IF EXISTS product_id
    `);

    // 2. Drop inventory_movements (indexes drop with the table)
    await q.query(`DROP TABLE IF EXISTS inventory_movements`);

    // 1. Drop products (indexes drop with the table)
    await q.query(`DROP TABLE IF EXISTS products`);
  },
};
