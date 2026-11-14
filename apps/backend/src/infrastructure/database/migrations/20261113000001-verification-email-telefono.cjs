'use strict';

/**
 * Migration: 20261113000001-verification-email-telefono
 *
 * El correo `doctor_pending_verification` (aviso a los super_admin de un
 * especialista nuevo) no traía el teléfono, y el equipo lo llama apenas llega
 * (pedido de Marco, 13/11). El teléfono ya es obligatorio en el registro.
 *
 * Se agrega una fila "Teléfono" justo debajo de "Cédula", copiando el markup de
 * esa misma fila (la plantilla pudo haberse editado desde /admin/email-templates,
 * así que no se pisa la fila completa: se duplica la fila de la cédula con otra
 * etiqueta y variable). Idempotente: si `{{phone}}` ya está, no hace nada.
 *
 * @type {import('sequelize-cli').Migration}
 */

const TEMPLATE = 'doctor_pending_verification';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET html = regexp_replace(
                html,
                '(<tr>((?:(?!</tr>).)*?)Cédula((?:(?!</tr>).)*?)\\{\\{cedula\\}\\}((?:(?!</tr>).)*?)</tr>)',
                '\\1<tr>\\2Teléfono\\3{{phone}}\\4</tr>'
              ),
              text = CASE
                WHEN text IS NULL THEN NULL
                ELSE regexp_replace(text, '(Cédula\\s*:\\s*\\{\\{cedula\\}\\})', E'\\\\1\\nTeléfono        : {{phone}}')
              END,
              updated_at = NOW()
        WHERE name = :template
          AND html NOT LIKE '%{{phone}}%'`,
      { replacements: { template: TEMPLATE } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET html = regexp_replace(html, '<tr>((?:(?!</tr>).)*?)\\{\\{phone\\}\\}((?:(?!</tr>).)*?)</tr>', '', 'g'),
              text = CASE WHEN text IS NULL THEN NULL
                          ELSE regexp_replace(text, '\\nTeléfono\\s*: \\{\\{phone\\}\\}', '', 'g') END,
              updated_at = NOW()
        WHERE name = :template`,
      { replacements: { template: TEMPLATE } },
    );
  },
};
