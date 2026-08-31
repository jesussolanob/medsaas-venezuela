'use strict';

/**
 * Migration: 20260830000002-verification-email-especialista
 *
 * El correo `doctor_pending_verification` que le llega al admin decía "Nuevo doctor".
 * La plataforma dejó de llamarles doctores hace rato (ADR-025: médico → especialista,
 * solo el sustantivo) porque no todos lo son — hay psicólogos, odontólogos,
 * nutricionistas. Este correo se quedó atrás.
 *
 * POR QUÉ SON REPLACE PUNTUALES Y NO UN UPDATE DEL TEMPLATE COMPLETO
 * ------------------------------------------------------------------
 * Las plantillas son EDITABLES desde `/admin/email-templates`. Pisar la fila entera
 * borraría cualquier ajuste que el dueño le haya hecho al correo. Se reemplazan
 * solo las tres frases visibles.
 *
 * ⚠️ NO se toca la palabra "doctor" en general, a propósito: `{{doctorName}}`,
 * `{{doctorEmail}}` y `{{doctorId}}` son variables atadas al código que arma el
 * correo. Un REPLACE amplio las rompería y el correo saldría con los marcadores
 * crudos.
 *
 * CORRECCIÓN (20260901000001): esta cabecera decía además que
 * `/admin/doctor-verifications` "es una ruta real". Es falso —el directorio no
 * existe en `apps/frontend/app/admin/`, la página vive en `/admin/verifications`—
 * y encima el enlace apuntaba al dominio equivocado. Dejar la URL afuera del
 * REPLACE fue lo correcto igual, pero por el motivo de arriba y no por ese.
 * La migración 20260901000001 la reemplaza por `{{panelUrl}}`.
 *
 * El `down` revierte exactamente las mismas tres frases.
 *
 * @type {import('sequelize-cli').Migration}
 */

const TEMPLATE = 'doctor_pending_verification';

/** [texto viejo, texto nuevo] — solo frases que ve una persona. */
const FRASES = [
  ['Nuevo doctor pendiente de verificación', 'Nuevo especialista pendiente de verificación'],
  ['Un nuevo doctor ha completado su registro', 'Un nuevo especialista ha completado su registro'],
  ['ID del doctor', 'ID del especialista'],
];

/** Aplica los reemplazos sobre subject, html y text de la plantilla. */
async function reemplazar(queryInterface, pares) {
  for (const [desde, hasta] of pares) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET subject    = REPLACE(subject, :desde, :hasta),
              html       = REPLACE(html, :desde, :hasta),
              text       = REPLACE(text, :desde, :hasta),
              updated_at = NOW()
        WHERE name = :template`,
      { replacements: { desde, hasta, template: TEMPLATE } },
    );
  }
}

module.exports = {
  async up(queryInterface) {
    await reemplazar(queryInterface, FRASES);
  },

  async down(queryInterface) {
    await reemplazar(
      queryInterface,
      FRASES.map(([desde, hasta]) => [hasta, desde]),
    );
  },
};
