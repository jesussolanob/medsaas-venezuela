'use strict';

/**
 * Rebranding de los correos: "Delta Medical [CRM]" → "Delta Salud" (nombre real
 * del producto) en TODAS las plantillas, y color del header de la confirmación
 * de cita al teal de la página (#0891b2, antes #0d9488 verde-teal).
 *
 * Es una data-migration (REPLACE sobre el contenido vivo en email_templates);
 * el `down` no revierte el texto (no se puede saber el original de forma segura).
 */

module.exports = {
  async up(queryInterface) {
    // 1) Marca: "Delta Medical CRM" y "Delta Medical" → "Delta Salud" (subject/html/text).
    await queryInterface.sequelize.query(`
      UPDATE email_templates SET
        subject = REPLACE(REPLACE(subject, 'Delta Medical CRM', 'Delta Salud'), 'Delta Medical', 'Delta Salud'),
        html    = REPLACE(REPLACE(html,    'Delta Medical CRM', 'Delta Salud'), 'Delta Medical', 'Delta Salud'),
        text    = REPLACE(REPLACE(text,    'Delta Medical CRM', 'Delta Salud'), 'Delta Medical', 'Delta Salud');
    `);

    // 2) Color del header/acentos de los correos de cita → teal de la página.
    await queryInterface.sequelize.query(`
      UPDATE email_templates SET
        html = REPLACE(html, '#0d9488', '#0891b2')
      WHERE name LIKE 'appointment%';
    `);
  },

  async down() {
    // No-op: data-migration de branding; no se revierte el texto.
  },
};
