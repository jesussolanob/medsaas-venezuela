'use strict';

/**
 * Migration: 20260901000001-verification-email-enlace-muerto
 *
 * El boton "Revisar en el panel" del correo `doctor_pending_verification` estaba
 * roto por partida doble desde que existe:
 *
 *   https://deltamedical.app/admin/doctor-verifications
 *            ^^^^^^^^^^^^^^^^        ^^^^^^^^^^^^^^^^^^^^
 *            dominio equivocado       ruta que no existe
 *
 * El dominio de la plataforma es deltasalud.app —deltamedical.app solo sobrevive
 * como NAMESPACE de los claims de Auth0, que es un identificador y no una
 * direccion que alguien visite— y la pagina de verificaciones vive en
 * `/admin/verifications`, no en `/admin/doctor-verifications`: ese directorio no
 * existe en `apps/frontend/app/admin/`.
 *
 * O sea que el admin recibia el aviso de un especialista nuevo y el unico boton
 * del correo lo llevaba a la nada.
 *
 * ⚠️ La migracion 20260830000002 afirma en un comentario que
 * `/admin/doctor-verifications` "es una ruta real". Es falso; se comprobo
 * listando el directorio. Aquella migracion igual hizo bien en no tocar la URL
 * con un REPLACE amplio — el motivo era bueno aunque el dato fuera erroneo.
 *
 * COMO SE ARREGLA
 * ---------------
 * La URL deja de estar escrita a mano en la plantilla y pasa a ser la variable
 * `{{panelUrl}}`, que `CompleteRegistrationUseCase` arma desde APP_BASE_URL /
 * FRONTEND_URL. Asi el correo apunta al entorno que lo envio: staging enlaza a
 * staging y produccion a produccion, que hasta ahora tampoco pasaba.
 *
 * Son REPLACE puntuales, no un UPDATE de la fila completa: las plantillas se
 * editan desde `/admin/email-templates` y pisarlas borraria los ajustes del
 * dueño. El `text` puede ser NULL, por eso el UPDATE lo protege.
 *
 * @type {import('sequelize-cli').Migration}
 */

const TEMPLATE = 'doctor_pending_verification';
const URL_MUERTA = 'https://deltamedical.app/admin/doctor-verifications';
const VARIABLE = '{{panelUrl}}';

/** Reemplaza `desde` por `hasta` en subject, html y text de la plantilla. */
async function reemplazar(queryInterface, desde, hasta) {
  await queryInterface.sequelize.query(
    `UPDATE email_templates
        SET html = REPLACE(html, :desde, :hasta),
            text = CASE WHEN text IS NULL THEN NULL ELSE REPLACE(text, :desde, :hasta) END,
            updated_at = NOW()
      WHERE name = :template`,
    { replacements: { desde, hasta, template: TEMPLATE } },
  );
}

module.exports = {
  async up(queryInterface) {
    await reemplazar(queryInterface, URL_MUERTA, VARIABLE);
  },

  async down(queryInterface) {
    await reemplazar(queryInterface, VARIABLE, URL_MUERTA);
  },
};
