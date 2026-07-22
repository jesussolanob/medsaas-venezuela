'use strict';

/**
 * Migration: 20260722000001-subscription-status-add-trialing
 *
 * FIX (bloqueante de registro en prod): el tipo ENUM `subscription_status` se creó
 * en la migración inicial (20260602000000) con 5 valores —
 *   'active', 'suspended', 'cancelled', 'trial', 'past_due' —
 * SIN 'trialing'. Pero el código asigna `status = 'trialing'` como estado del trial
 * de onboarding (plan free_trial) al dar de alta un doctor nuevo, tanto en el alta
 * self-service (resolve-identity → sequelize-identity.repository) como en el alta por
 * admin (sequelize-admin.repository). El INSERT reventaba con
 *   `invalid input value for enum subscription_status: "trialing"`
 * (SequelizeDatabaseError → 500), rompiendo TODO registro nuevo: el doctor rebotaba
 * a la landing sin perfil creado y no aparecía en el panel de super admin.
 *
 * `shared-types` ya declara 'trialing' en SubscriptionStatusSchema y ~8 rutas de
 * lectura lo tratan como estado activo/trial; el enum de la BD era el único lugar
 * sin el valor. Se agrega al enum para alinear la BD con el código.
 *
 * Idempotente (`ADD VALUE IF NOT EXISTS`). No corre dentro de una transacción del
 * runner (las migraciones de este repo usan queryInterface.sequelize.query directo,
 * autocommit) y el valor NO se usa dentro de esta misma migración, así que es seguro
 * en PostgreSQL 16. PostgreSQL no permite eliminar un valor de un ENUM, por eso
 * `down` es un no-op documentado.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'trialing';`,
    );
  },

  async down() {
    // PostgreSQL no soporta DROP VALUE en un ENUM. Dejar 'trialing' presente es
    // inocuo (ninguna fila lo requiere para el rollback), por lo que el rollback
    // es intencionalmente un no-op.
  },
};
