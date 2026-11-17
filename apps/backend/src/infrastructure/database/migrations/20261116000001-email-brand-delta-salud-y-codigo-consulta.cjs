'use strict';

/**
 * Migration: 20261116000001-email-brand-delta-salud-y-codigo-consulta
 *
 * 1) Second rebranding pass: 20260710000001 replaced "Delta Medical CRM" with
 *    "Delta Salud", but templates created afterwards (new-appointment notice to
 *    the specialist, quotes, subscription checkout…) brought the old name back.
 *    Reported on 2026-11-16 from the "Nueva cita" email.
 * 2) `reminder_manual`: the code shown is now the CONSULTATION code (DLT-…), the
 *    one patients see everywhere else, so the label says "código de consulta".
 *
 * Data migration over the live rows (they may have been edited from
 * /admin/email-templates): plain REPLACE, idempotent. `down` only restores the
 * label; the old brand is not put back.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE email_templates SET
        subject = REPLACE(REPLACE(subject, 'Delta Medical CRM', 'Delta Salud'), 'Delta Medical', 'Delta Salud'),
        html    = REPLACE(REPLACE(html,    'Delta Medical CRM', 'Delta Salud'), 'Delta Medical', 'Delta Salud'),
        text    = REPLACE(REPLACE(text,    'Delta Medical CRM', 'Delta Salud'), 'Delta Medical', 'Delta Salud'),
        updated_at = NOW()
      WHERE subject LIKE '%Delta Medical%' OR html LIKE '%Delta Medical%' OR text LIKE '%Delta Medical%';
    `);

    await queryInterface.sequelize.query(`
      UPDATE email_templates SET
        html = REPLACE(html, 'Tu c&oacute;digo de cita', 'Tu c&oacute;digo de consulta'),
        text = REPLACE(text, 'Código:   {{code}}', 'Código de consulta: {{code}}'),
        updated_at = NOW()
      WHERE name = 'reminder_manual';
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE email_templates SET
        html = REPLACE(html, 'Tu c&oacute;digo de consulta', 'Tu c&oacute;digo de cita'),
        text = REPLACE(text, 'Código de consulta: {{code}}', 'Código:   {{code}}'),
        updated_at = NOW()
      WHERE name = 'reminder_manual';
    `);
  },
};
