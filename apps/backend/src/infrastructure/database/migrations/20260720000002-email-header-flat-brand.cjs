'use strict';

/**
 * Migration: 20260720000002-email-header-flat-brand
 *
 * Normaliza el header de TODAS las plantillas de email al estándar de marca:
 *   .header { background: #0d9488; ... }
 *
 * Antes de esta migración había 4 desviaciones respecto al resto del sistema:
 *   - appointment_confirmed : background sólido #0891b2 (cyan, no la marca)
 *   - reminder_1h           : background linear-gradient(135deg,#0d9488→#0f766e)
 *   - reminder_confirm_24h  : background linear-gradient(...)
 *   - reminder_manual       : background linear-gradient(...) + emoji 📅 en el <h1>
 *
 * La transformación se hace en JS sobre el HTML actual de cada fila (más robusto
 * que un regexp_replace en SQL por el escape de backslashes). Es idempotente:
 * recalcula desde el html vigente, así que las 11 plantillas ya correctas NO
 * cambian y re-ejecutarla no produce efectos.
 *
 * @type {import('sequelize-cli').Migration}
 */
const BRAND_BG = '#0d9488';

/** Aplica el header sólido de marca y quita el emoji 📅 del encabezado. */
function normalizeHeader(html) {
  return html
    // Reemplaza SOLO el valor de `background:` dentro de la regla `.header { ... }`
    // (gradiente o cualquier hex) por el color sólido de marca.
    .replace(/(\.header\s*\{[^}]*?background:\s*)[^;]+/, `$1${BRAND_BG}`)
    // Quita la entidad del emoji de calendario (📅) del <h1> del header.
    .replace(/&#x1F4C5;\s*/g, '');
}

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT id, html FROM email_templates',
    );

    for (const row of rows) {
      const html = normalizeHeader(row.html);
      if (html !== row.html) {
        await queryInterface.sequelize.query(
          'UPDATE email_templates SET html = :html, updated_at = NOW() WHERE id = :id',
          { replacements: { html, id: row.id } },
        );
      }
    }
  },

  async down() {
    // Normalización cosmética de marca — no se revierte (no-op).
  },
};
