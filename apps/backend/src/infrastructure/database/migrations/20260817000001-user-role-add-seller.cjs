'use strict';

/**
 * Migration: 20260817000001-user-role-add-seller
 *
 * FIX (el módulo de ventas nunca funcionó): el ENUM `user_role` se creó en la
 * migración inicial (20260602000000) con 4 valores —
 *   'super_admin', 'doctor', 'assistant', 'patient'
 * — y el módulo de vendedores (20260816000001-seller-role) agregó
 * `profiles.seller_code`, `profiles.sold_by` y las filas de `role_capabilities`,
 * pero NUNCA agregó 'seller' al enum. `role_capabilities.role` es TEXT y por eso
 * el seed pasó sin ruido; `profiles.role` sí es `user_role`, así que TODO el
 * módulo reventaba con
 *   `invalid input value for enum user_role: "seller"`
 * (SequelizeDatabaseError → 500):
 *
 *   - POST /api/admin/sellers  → el INSERT con role='seller' moría.
 *   - GET  /api/admin/sellers  → el WHERE role = 'seller' moría.
 *
 * Nadie lo detectó porque la ruta del BFF para el alta tampoco existía (se creó
 * el 2026-08-17), así que ningún vendedor llegó a crearse nunca y el error no
 * tenía forma de salir a la luz.
 *
 * Es el MISMO patrón que 20260722000001 (subscription_status sin 'trialing'):
 * el código y `shared-types` declaran un valor que el enum de la BD no tiene.
 *
 * Idempotente (`ADD VALUE IF NOT EXISTS`). No corre dentro de una transacción
 * del runner (las migraciones de este repo usan `queryInterface.sequelize.query`
 * directo, autocommit) y el valor NO se usa dentro de esta misma migración, así
 * que es seguro en PostgreSQL 16. PostgreSQL no permite eliminar un valor de un
 * ENUM, por eso `down` es un no-op documentado.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'seller';`,
    );
  },

  async down() {
    // PostgreSQL no soporta DROP VALUE en un ENUM. Dejar 'seller' presente es
    // inocuo, por lo que el rollback es intencionalmente un no-op.
  },
};
