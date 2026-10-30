'use strict';

/**
 * Migration: 20261030000005-retention-admin-capabilities
 *
 * The admin sidebar hides every entry whose `moduleKey` the role cannot `view`
 * (`can(caps, moduleKey, 'view')` in apps/frontend/app/admin/layout.tsx), and
 * there is no wildcard for super_admin: capabilities come only from
 * `role_capabilities`. The retention phases added three admin modules without
 * seeding them, so "Solicitudes de contacto", "Novedades" and "Reuniones" would
 * be invisible (verified on staging 2026-10-30: neither role had these keys).
 *
 *   super_admin × {contact_requests, release_notes, team_meetings}
 *   admin       × {release_notes}   (owner: any administrator publishes news;
 *                                    the other two are super_admin-only in the backend)
 *
 * Idempotent: ON CONFLICT (role, module_key, action) DO UPDATE.
 *
 * @type {import('sequelize-cli').Migration}
 */

const ACTIONS = ['view', 'create', 'edit', 'delete'];
const GRANTS = [
  ['super_admin', 'contact_requests'],
  ['super_admin', 'release_notes'],
  ['super_admin', 'team_meetings'],
  ['admin', 'release_notes'],
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [role, moduleKey] of GRANTS) {
        for (const action of ACTIONS) {
          await queryInterface.sequelize.query(
            `INSERT INTO role_capabilities
               (id, role, module_key, action, allowed, created_at, updated_at)
             VALUES (uuid_generate_v4(), :role, :moduleKey, :action, true, now(), now())
             ON CONFLICT (role, module_key, action)
             DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()`,
            { transaction, replacements: { role, moduleKey, action } },
          );
        }
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [role, moduleKey] of GRANTS) {
        await queryInterface.sequelize.query(
          `DELETE FROM role_capabilities WHERE role = :role AND module_key = :moduleKey`,
          { transaction, replacements: { role, moduleKey } },
        );
      }
    });
  },
};
