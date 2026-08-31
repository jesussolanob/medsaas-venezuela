'use strict';

/**
 * Migration: 20260831000001-welcome-email-sin-dr
 *
 * El correo de bienvenida saludaba "Estimado/a Dr/a. {{doctorName}}" y decía que
 * la plataforma está "diseñada para médicos especialistas".
 *
 * No todos los especialistas son médicos: hay psicólogos, odontólogos,
 * nutricionistas y fisioterapeutas. Es el mismo criterio que ya se aplicó en el
 * dashboard, en el booking público y en el onboarding (ADR-051): **la app no
 * asume el título de nadie**. Acá el problema es peor que en pantalla, porque un
 * correo no se puede corregir después de enviado.
 *
 * Se saluda por el nombre a secas. No se intenta derivar el título como hace la
 * UI: el correo se arma con `{{doctorName}}` y no tiene la especialidad a mano,
 * así que meter un título sería volver a adivinar.
 *
 * POR QUÉ SON REPLACE PUNTUALES Y NO UN UPDATE DEL TEMPLATE COMPLETO
 * ------------------------------------------------------------------
 * Las plantillas son EDITABLES desde `/admin/email-templates`. Pisar la fila
 * entera borraría cualquier ajuste que el dueño le haya hecho al correo.
 *
 * ⚠️ NO se toca `{{doctorName}}`: es la variable que rellena el nombre.
 *
 * @type {import('sequelize-cli').Migration}
 */

const TEMPLATE = 'welcome';

/** [texto viejo, texto nuevo] — solo frases que ve una persona. */
const FRASES = [
  ['Estimado/a Dr/a. ', 'Hola '],
  ['diseñada para médicos especialistas en Venezuela', 'diseñada para especialistas en Venezuela'],
];

async function reemplazar(queryInterface, pares) {
  for (const [desde, hasta] of pares) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET subject    = REPLACE(subject, :desde, :hasta),
              html       = REPLACE(html, :desde, :hasta),
              -- Se preserva el NULL: con COALESCE quedaría cadena vacía, que es
              -- un valor distinto y un cambio de dato que nadie pidió.
              text       = CASE WHEN text IS NULL THEN NULL
                                ELSE REPLACE(text, :desde, :hasta) END,
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
