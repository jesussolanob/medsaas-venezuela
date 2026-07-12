'use strict';

/**
 * Migration: 20260712000001-seed-super-admins
 *
 * Crea (o promueve) dos cuentas como super_admin en `profiles`, por pedido del
 * usuario. La elevación a super_admin es, por diseño, una acción manual de DBA:
 * el IdentityResolverService NUNCA crea super_admins al loguear (degrada roles
 * prohibidos a doctor para perfiles nuevos) y, para perfiles EXISTENTES, matchea
 * por email y preserva el rol de la BD. Por eso:
 *   - Si el perfil ya existe (ya logueó) → se promueve a super_admin (UPDATE).
 *   - Si no existe → se crea con role='super_admin'; al loguear con Auth0, el
 *     resolver lo encuentra por email y respeta el rol (backfillea auth0_sub).
 *
 * `profiles.email` tiene UNIQUE index (idx_profiles_email) → ON CONFLICT (email).
 * full_name es NOT NULL (placeholder; el usuario puede editarlo luego).
 * Idempotente. down(): no-op (revertir un rol de acceso es riesgoso; hacerlo a mano).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`
      INSERT INTO profiles (id, full_name, email, role, is_active, created_at, updated_at)
      VALUES
        (gen_random_uuid(), 'Jesús Solano',  'jesus.solano@deltasalud.app',  'super_admin', true, now(), now()),
        (gen_random_uuid(), 'Marco Villegas', 'marco.villegas@deltasalud.app', 'super_admin', true, now(), now())
      ON CONFLICT (email) DO UPDATE
        SET role = 'super_admin',
            is_active = true,
            updated_at = now()
    `);
  },

  async down() {
    // No-op: revertir una elevación a super_admin es una acción manual de DBA.
  },
};
