'use strict';

/**
 * Migration: 20260908000004-quotes-renumber-cot-to-pre
 *
 * Renumera los presupuestos existentes de `COT-XXXX` a `PRE-XXXX`.
 *
 * El módulo se renombró de "Cotizaciones" a "Presupuestos" y toda la interfaz ya
 * dice presupuesto — menos el número, que seguía arrancando con COT (de
 * cotización). Ese número es justamente lo que el paciente ve en el PDF, en el
 * correo y en el enlace público, así que era el único lugar donde el nombre
 * viejo seguía a la vista.
 *
 * Solo cambia el PREFIJO: la parte numérica se conserva tal cual, así que
 * COT-0004 pasa a ser PRE-0004. La correspondencia con un presupuesto ya enviado
 * se mantiene reconocible.
 *
 * ⚠️ EFECTO CONOCIDO: un destinatario que recibió el correo cuando decía
 * "COT-0004" va a ver "PRE-0004" si vuelve a abrir el enlace. Se aceptó a cambio
 * de no dejar dos nomenclaturas conviviendo para siempre (decisión del dueño,
 * 2026-09-08).
 *
 * La unicidad no corre riesgo: el constraint es (doctor_id, quote_number) y el
 * cambio es un renombre uno a uno dentro de cada especialista, sin colisiones
 * posibles salvo que un mismo doctor ya tuviera un PRE- con el mismo número —
 * caso imposible porque hasta ahora todos se generaban con COT-.
 *
 * Idempotente: la segunda corrida no encuentra filas con COT- y no hace nada.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE quotes
         SET quote_number = 'PRE-' || SUBSTRING(quote_number FROM 5),
             updated_at   = NOW()
       WHERE quote_number LIKE 'COT-%'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE quotes
         SET quote_number = 'COT-' || SUBSTRING(quote_number FROM 5),
             updated_at   = NOW()
       WHERE quote_number LIKE 'PRE-%'
    `);
  },
};
