'use strict';

/**
 * Migration: 20260810000001-payment-instructions-bullets
 *
 * Reescribe `app_settings.platform_payment_instructions` para que los datos
 * bancarios queden en viñetas en vez de embutidos en un párrafo corrido.
 *
 * El texto original metía banco, RIF y beneficiario dentro de la misma oración,
 * separados por "·". El especialista tenía que leer la frase entera para
 * encontrar el número de cuenta, justo en el momento de transferir. Ahora cada
 * dato va en su propia línea; `PaymentInstructions.tsx` las renderiza como lista.
 *
 * SOLO actualiza si el valor sigue siendo EXACTAMENTE el sembrado por
 * `20260805000002`. Este texto es editable por el super admin desde
 * /admin/settings: si ya lo personalizó (por ejemplo, con los datos bancarios
 * reales), pisarlo le borraría su versión — y encima con un RIF de ejemplo.
 *
 * El nombre del beneficiario NO se toca. Es el titular de una cuenta bancaria
 * real, no un texto de marca: cambiarlo por "Delta Salud" podría hacer que las
 * transferencias se rechacen o se manden a un nombre que no coincide con la
 * cuenta.
 *
 * @type {import('sequelize-cli').Migration}
 */

const ORIGINAL =
  'Realice su transferencia bancaria o pago móvil y adjunte el comprobante aquí. ' +
  'Datos de pago: Banco: Mercantil · RIF: J-000000000-0 · Beneficiario: Delta Medical CRM, C.A. ' +
  'Incluya su número de cédula como concepto de pago para identificar la transacción.';

const BULLETED = [
  'Realice su transferencia bancaria o pago móvil y adjunte el comprobante aquí.',
  '',
  'Datos de pago:',
  '- Banco: Mercantil',
  '- RIF: J-000000000-0',
  '- Beneficiario: Delta Medical CRM, C.A.',
  '',
  'Incluya su número de cédula como concepto de pago para identificar la transacción.',
].join('\n');

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE app_settings
          SET value = :nuevo, updated_at = NOW()
        WHERE key = 'platform_payment_instructions'
          AND value = :original`,
      { replacements: { nuevo: BULLETED, original: ORIGINAL } },
    );
  },

  async down(queryInterface) {
    // Simétrico: solo revierte si nadie lo editó después.
    await queryInterface.sequelize.query(
      `UPDATE app_settings
          SET value = :original, updated_at = NOW()
        WHERE key = 'platform_payment_instructions'
          AND value = :nuevo`,
      { replacements: { nuevo: BULLETED, original: ORIGINAL } },
    );
  },
};
