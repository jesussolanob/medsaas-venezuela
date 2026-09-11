'use strict';

/**
 * Migration: 20260911000002-payments-consultation-id
 *
 * Agrega `consultation_id` (UUID nullable FK) a la tabla `payments`.
 *
 * ⚠️ POR QUÉ VA OBLIGATORIAMENTE JUNTO AL CÓDIGO:
 * Las sesiones 2..N de un paquete tienen un pago DE PAQUETE apuntando a ellas
 * via `appointments.payment_id`. Si el especialista cobra extras en una de esas
 * sesiones y se reutiliza el mismo path de Step 5b, ese UPDATE pisaría el
 * `amount_usd` del paquete con el importe de los extras — destruyendo el registro
 * financiero del pago original.
 *
 * La solución es crear un pago APARTE para los extras, anclado a la consulta
 * cubierta en lugar de a la cita. Sin esta columna no hay dónde colgar ese pago
 * nuevo, y el código que intenta hacer el INSERT fallaría en producción.
 *
 * DECISIÓN DE ESQUEMA: `payments.consultation_id` en lugar de un second-link
 * en appointments porque:
 *   1. `appointments.payment_id` ya ocupa el slot con el pago del paquete.
 *   2. Un pago de extras no "pertenece" a la cita (la cita ya tiene su pago);
 *      pertenece a la consulta concreta donde se usaron los productos/servicios.
 *   3. La lista de Cobros (`listForDoctor`) ya selecciona `c.consultation_code`
 *      via JOIN; cambiar el JOIN a COALESCE(a.consultation_id, p.consultation_id)
 *      expone automáticamente el código de consulta de los pagos de extras.
 *
 * IDEMPOTENCIA: el índice parcial UNIQUE impide que `approveWithExtras` cree
 * dos filas para la misma consulta cuando se llama varias veces (re-aprobación).
 * ON CONFLICT DO UPDATE actualiza el monto sin duplicar.
 *
 * Todo va en UNA transacción.
 *
 * @type {import('sequelize-cli').Migration}
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      // 1. Columna nullable — no rompe filas existentes.
      await q(`
        ALTER TABLE payments
          ADD COLUMN IF NOT EXISTS consultation_id UUID NULL
            REFERENCES consultations(id) ON DELETE SET NULL
      `);

      // 2. Índice parcial UNIQUE para garantizar idempotencia en la aprobación
      //    de extras de sesiones cubiertas.
      //    Parcial (WHERE consultation_id IS NOT NULL) para no interferir con
      //    los miles de pagos ya existentes que tienen consultation_id = NULL.
      await q(`
        CREATE UNIQUE INDEX IF NOT EXISTS payments_consultation_id_unique
          ON payments (consultation_id)
          WHERE consultation_id IS NOT NULL
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await q(`DROP INDEX IF EXISTS payments_consultation_id_unique`);
      await q(`ALTER TABLE payments DROP COLUMN IF EXISTS consultation_id`);
    });
  },
};
