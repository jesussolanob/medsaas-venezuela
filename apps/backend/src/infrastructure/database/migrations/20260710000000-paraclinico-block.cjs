'use strict';

/**
 * Agrega el bloque "Paraclínico" al catálogo de bloques de consulta.
 *
 * Forma parte de los 6 bloques estándar de nombre fijo (no renombrables):
 *   Motivo de consulta (chief_complaint), Antecedentes (history),
 *   Diagnóstico (diagnosis), Prescripción (prescription),
 *   Indicaciones (indications) y **Paraclínico (paraclinical)** ← este.
 *
 * default_enabled=false: no entra al set activo por defecto; el doctor lo habilita
 * si lo usa. El nombre se bloquea en la UI de configuración de bloques.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO consultation_block_catalog
        (key, default_label, default_content_type, default_printable, default_send_to_patient, default_enabled, description)
      VALUES
        ('paraclinical', 'Paraclínico', 'rich_text', true, true, false, 'Estudios paraclínicos (laboratorio, imágenes)')
      ON CONFLICT (key) DO UPDATE SET
        default_label = EXCLUDED.default_label,
        description   = EXCLUDED.description;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM consultation_block_catalog WHERE key = 'paraclinical';`,
    );
  },
};
