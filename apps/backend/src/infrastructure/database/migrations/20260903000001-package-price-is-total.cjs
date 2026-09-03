'use strict';

/**
 * Migration: 20260903000001-package-price-is-total
 *
 * Convierte `pricing_plans.price_usd` de precio UNITARIO a precio TOTAL del
 * paquete (ADR-025 rev.2).
 *
 * Hasta hoy el especialista cargaba el precio de UNA sesión y la app multiplicaba
 * por `sessions_count` para cobrar. Eso confundía: en la pantalla convivían el
 * número escrito y otro número calculado. Desde ahora se carga el precio de todo
 * el paquete y NO se multiplica en ningún lado.
 *
 * ⚠️ POR QUÉ ESTA MIGRACIÓN ES OBLIGATORIA Y VA JUNTO AL CÓDIGO:
 * las filas existentes tienen el unitario. Si el código deja de multiplicar y los
 * datos no se convierten, un paquete de 4 consultas a 30 pasa de cobrar 120 a
 * cobrar 30 — silenciosamente y a favor del paciente. Multiplicar acá deja a cada
 * servicio cobrando EXACTAMENTE lo mismo que cobraba ayer.
 *
 * Solo toca filas con sessions_count > 1: en las de una sesión, unitario y total
 * ya son el mismo número, y multiplicar por 1 sería ruido.
 *
 * NO toca `appointments.plan_price` ni `patient_packages`: ahí el precio quedó
 * congelado al momento de la reserva y es historia, no catálogo. Reescribirlo
 * cambiaría lo que ya se cobró.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`
      UPDATE pricing_plans
         SET price_usd = price_usd * sessions_count,
             updated_at = NOW()
       WHERE sessions_count IS NOT NULL
         AND sessions_count > 1
    `);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;

    // Vuelve al unitario. Divide solo donde el resultado es exacto a 2 decimales:
    // si un precio de paquete no es múltiplo de sus sesiones (p.ej. 100 en 3), la
    // división daría 33.33 y multiplicar de nuevo NO devolvería 100. Esas filas se
    // dejan como están: es preferible un precio sin revertir que uno mal redondeado
    // en una columna de dinero.
    await q.query(`
      UPDATE pricing_plans
         SET price_usd = price_usd / sessions_count,
             updated_at = NOW()
       WHERE sessions_count IS NOT NULL
         AND sessions_count > 1
         AND (price_usd / sessions_count) * sessions_count = price_usd
    `);
  },
};
