'use strict';

/**
 * Migration: quita la fila "ID del doctor" de la plantilla de correo
 * `doctor_pending_verification` (la que reciben los administradores cuando un
 * especialista nuevo queda pendiente de verificación).
 *
 * El UUID interno no le sirve a quien lee el correo: el admin identifica al
 * especialista por nombre, cédula y correo, y actúa desde el panel.
 *
 * Se opera sobre la plantilla guardada en BD con regexp_replace en vez de
 * reinsertar el HTML completo, para no pisar otros ajustes de estilo que se
 * hayan aplicado a la plantilla (ha pasado por 3 migraciones de restyle).
 *
 * Cubre las dos variantes historicas de la fila (con class="label" y con estilos
 * inline) y la linea equivalente de la version en texto plano.
 *
 * Idempotente: si la fila ya no existe, no cambia nada.
 */

/** Fila <tr> cuya primera celda es exactamente "ID del doctor". */
const HTML_ROW_PATTERN = '<tr>\\s*<td[^>]*>ID del doctor</td>\\s*<td[^>]*>\\{\\{doctorId\\}\\}</td>\\s*</tr>';

/** Linea "ID del doctor  : {{doctorId}}" de la variante en texto plano. */
const TEXT_LINE_PATTERN = '\\n?ID del doctor\\s*:\\s*\\{\\{doctorId\\}\\}';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET html       = regexp_replace(html, :htmlPattern, '', 'g'),
              text       = regexp_replace(COALESCE(text, ''), :textPattern, '', 'g'),
              updated_at = NOW()
        WHERE name = 'doctor_pending_verification'`,
      { replacements: { htmlPattern: HTML_ROW_PATTERN, textPattern: TEXT_LINE_PATTERN } },
    );
  },

  async down() {
    // Sin reversa: el dato es ruido para el destinatario y reponer la fila
    // exigiria reconstruir el HTML de la variante de estilo vigente.
  },
};
