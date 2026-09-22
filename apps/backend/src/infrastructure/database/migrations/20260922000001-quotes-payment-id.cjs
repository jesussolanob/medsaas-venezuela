'use strict';

/**
 * Migration: 20260922000001-quotes-payment-id
 *
 * Agrega `payment_id` (UUID nullable FK) a la tabla `quotes`.
 *
 * PROPÓSITO:
 * Cuando un presupuesto es aceptado (por el paciente o por el especialista)
 * se crea automáticamente un pago pendiente en `payments`. Este campo vincula
 * el presupuesto con ese pago y sirve como clave de idempotencia (ADR-058):
 * el UPDATE que transiciona a 'accepted' incluye `payment_id IS NULL` en el
 * WHERE, de modo que un segundo intento concurrente de aceptar el mismo
 * presupuesto afecta 0 filas y su INSERT de pago es revertido en la misma
 * transacción.
 *
 * DISEÑO:
 * - Columna nullable: los presupuestos ya existentes y los que todavía no han
 *   sido aceptados tienen payment_id = NULL. No se requiere backfill.
 * - La FK es SET NULL on delete: si el pago se elimina (poco probable) el
 *   presupuesto no pierde su historia.
 * - Sin NOT NULL constraint para no romper las migraciones anteriores ni la
 *   aceptación manual de presupuestos dirigidos a leads (sin paciente).
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
        ALTER TABLE quotes
          ADD COLUMN IF NOT EXISTS payment_id UUID NULL
            REFERENCES payments(id) ON DELETE SET NULL
      `);

      // 2. Índice para acelerar la búsqueda inversa (payment → quote).
      await q(`
        CREATE INDEX IF NOT EXISTS quotes_payment_id_idx
          ON quotes (payment_id)
          WHERE payment_id IS NOT NULL
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await q(`DROP INDEX IF EXISTS quotes_payment_id_idx`);
      await q(`ALTER TABLE quotes DROP COLUMN IF EXISTS payment_id`);
    });
  },
};
