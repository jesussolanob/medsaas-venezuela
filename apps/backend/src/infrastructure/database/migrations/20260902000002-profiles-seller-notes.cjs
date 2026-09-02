'use strict';

/**
 * Migration: 20260902000002-profiles-seller-notes
 *
 * Adds `profiles.seller_notes` — anotaciones libres del vendedor sobre el
 * especialista de su cartera ("prefiere que lo llamen de tarde", "pidió que le
 * recuerde en marzo").
 *
 * Por qué en `profiles` y no en una tabla propia: es UNA nota por especialista,
 * no un historial. Una tabla aparte agregaría un JOIN y un módulo entero para
 * guardar un campo de texto.
 *
 * ⚠️ La nota queda pegada al especialista, no al vendedor. Si el admin reasigna
 * ese especialista a otro vendedor, el nuevo ve la nota del anterior. Es la
 * decisión más simple y coincide con que el historial comercial es de la empresa
 * (misma lógica que ya rige las comisiones al reasignar).
 *
 * `phone` NO se agrega acá: la columna ya existe en profiles. Lo que faltaba era
 * dejar que el vendedor la escribiera desde su portal.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS seller_notes TEXT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        DROP COLUMN IF EXISTS seller_notes
    `);
  },
};
