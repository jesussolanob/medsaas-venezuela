'use strict';

/**
 * Migration: unifica la terminología de las plantillas de correo guardadas en BD.
 *
 * En este sistema se habla de "consulta", no de "consulta médica": no todos los
 * especialistas son médicos (psicólogos, nutricionistas, fisioterapeutas...).
 * Lo mismo con la etiqueta "Médico:" del cuerpo del correo → "Especialista:".
 *
 * Se hace con REPLACE sobre las columnas en vez de reinsertar las plantillas
 * completas, para no pisar ediciones que se hayan hecho por otra vía.
 *
 * Idempotente: aplicar dos veces no cambia nada (los patrones ya no existen).
 */

const SUSTITUCIONES = [
  ['consulta médica', 'consulta'],
  ['Consulta médica', 'Consulta'],
  ['consultas médicas', 'consultas'],
  ['Médico:', 'Especialista:'],
];

/** Encadena REPLACE(...) sobre una columna para todas las sustituciones. */
function buildReplaceExpr(column) {
  return SUSTITUCIONES.reduce(
    (expr, [from, to]) => `REPLACE(${expr}, ${quote(from)}, ${quote(to)})`,
    column,
  );
}

function quote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET subject    = ${buildReplaceExpr('subject')},
              html       = ${buildReplaceExpr('html')},
              text       = ${buildReplaceExpr('text')},
              updated_at = NOW()
        WHERE subject ILIKE '%consulta médica%'
           OR subject ILIKE '%consultas médicas%'
           OR html    ILIKE '%consulta médica%'
           OR html    ILIKE '%consultas médicas%'
           OR html    LIKE  '%Médico:%'
           OR text    ILIKE '%consulta médica%'
           OR text    ILIKE '%consultas médicas%'
           OR text    LIKE  '%Médico:%'`,
    );
  },

  async down() {
    // Sin reversa: revertir reintroduciría la terminología incorrecta y no hay
    // forma segura de distinguir los textos que ya decían "consulta" de origen.
  },
};
