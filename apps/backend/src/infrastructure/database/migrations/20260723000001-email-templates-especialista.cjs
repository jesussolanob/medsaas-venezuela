'use strict';

/**
 * Migration: 20260723000001-email-templates-especialista
 *
 * Sustituye las formas SUSTANTIVAS de "médico" (el profesional) en el
 * contenido de todas las plantillas de email (columnas html, text, subject).
 *
 * Frases reemplazadas (solo sustantivo, no adjetivo):
 *   '<strong>Médico:</strong>'  →  '<strong>Especialista:</strong>'
 *   'Su médico'                →  'Su especialista'
 *   'su médico'                →  'su especialista'
 *   'Tu médico'                →  'Tu especialista'
 *   'tu médico'                →  'tu especialista'
 *   'el médico'                →  'el especialista'
 *
 * Estas cadenas NO coinciden con usos adjetivales como "documentos médicos",
 * "informe médico" o "uso médico exclusivo", por lo que el REPLACE es seguro.
 *
 * Idempotencia: REPLACE('…especialista…', '…médico…', '…especialista…')
 * devuelve la cadena sin cambios, así que re-ejecutar esta migración es inocuo.
 *
 * Se aplica a TODAS las filas (sin WHERE) ya que cada REPLACE que no
 * encuentra la cadena buscada devuelve el valor original sin modificar.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    // Columna: html
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET html = REPLACE(
                      REPLACE(
                        REPLACE(
                          REPLACE(
                            REPLACE(
                              REPLACE(html,
                                '<strong>Médico:</strong>', '<strong>Especialista:</strong>'),
                              'Su médico', 'Su especialista'),
                            'su médico', 'su especialista'),
                          'Tu médico', 'Tu especialista'),
                        'tu médico', 'tu especialista'),
                      'el médico', 'el especialista')`,
    );

    // Columna: text (nullable — REPLACE(NULL, …) = NULL, no-op seguro)
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET text = REPLACE(
                      REPLACE(
                        REPLACE(
                          REPLACE(
                            REPLACE(
                              REPLACE(text,
                                'Su médico', 'Su especialista'),
                              'su médico', 'su especialista'),
                            'Tu médico', 'Tu especialista'),
                          'tu médico', 'tu especialista'),
                        'el médico', 'el especialista'),
                      '<strong>Médico:</strong>', '<strong>Especialista:</strong>')
        WHERE text IS NOT NULL`,
    );

    // Columna: subject
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET subject = REPLACE(
                          REPLACE(
                            REPLACE(
                              REPLACE(
                                REPLACE(
                                  REPLACE(subject,
                                    'Su médico', 'Su especialista'),
                                  'su médico', 'su especialista'),
                                'Tu médico', 'Tu especialista'),
                              'tu médico', 'tu especialista'),
                            'el médico', 'el especialista'),
                          '<strong>Médico:</strong>', '<strong>Especialista:</strong>')`,
    );

    // updated_at en una sola pasada sobre todas las filas
    await queryInterface.sequelize.query(
      `UPDATE email_templates SET updated_at = NOW()`,
    );
  },

  async down(queryInterface) {
    // Solo revertimos el cambio de la etiqueta estructurada <strong>Médico:</strong>.
    // Las sustituciones de texto libre (Su/su/Tu/tu/el médico) no se revierten
    // para evitar colisiones con contenido editado manualmente en producción.
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET html       = REPLACE(html, '<strong>Especialista:</strong>', '<strong>Médico:</strong>'),
              updated_at = NOW()
        WHERE html LIKE '%<strong>Especialista:</strong>%'`,
    );
  },
};
