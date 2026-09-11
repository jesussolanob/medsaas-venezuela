'use strict';

/**
 * Migration: 20260911000001-un-solo-vocabulario-de-metodo-de-pago
 *
 * Unifica los métodos de pago en UN vocabulario, el español:
 *   cash_usd → efectivo        cash_bs → efectivo_bs
 *
 * ⚠️ POR QUÉ VA OBLIGATORIAMENTE JUNTO AL CÓDIGO:
 * hasta hoy convivían dos. La reserva pública y `/doctor/settings` escribían
 * `cash_usd`/`cash_bs`; Consultas, Agenda y Pacientes usaban `efectivo`/`efectivo_bs`.
 * Como el selector de método al cobrar se FILTRA por `profiles.payment_methods`,
 * el especialista abría una consulta pagada en efectivo y no tenía la opción:
 * veía "— Sin especificar —" y perdía cómo dijo pagar el paciente.
 *
 * Si el código se despliega sin esta migración, un especialista cuyo perfil siga
 * diciendo `cash_usd` ve en su reserva pública un botón con el texto crudo
 * "cash_usd", y `requiresReceipt` le exige comprobante a un pago en efectivo.
 * Al revés (migrar sin el código) el efecto es el mismo pero simétrico.
 *
 * Las pantallas siguen entendiendo los valores viejos al LEER (mapas de labels con
 * alias), así que una fila que se escape no se muestra en inglés.
 *
 * Todo va en UNA transacción. Es idempotente: correrla dos veces no cambia nada
 * la segunda vez, porque las condiciones ya no encuentran filas.
 *
 * @type {import('sequelize-cli').Migration}
 */

/** Columnas TEXT sueltas que guardan un método de pago. */
const TEXT_COLUMNS = [
  ['appointments', 'payment_method'],
  ['consultations', 'payment_method'],
  ['payments', 'method_snapshot'],
  ['consultation_payments', 'payment_method'],
];

/** Renombra una clave dentro de un JSONB, conservando la que ya existiera. */
function renameJsonbKey(table, column, from, to) {
  return `
    UPDATE ${table}
       SET ${column} = (${column} - '${from}')
                       || jsonb_build_object('${to}',
                            COALESCE(${column} -> '${to}', ${column} -> '${from}'))
     WHERE ${column} ? '${from}'
  `;
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      // --- 1. Columnas TEXT ---------------------------------------------------
      for (const [table, column] of TEXT_COLUMNS) {
        await q(`
          UPDATE ${table}
             SET ${column} = CASE ${column}
                               WHEN 'cash_usd' THEN 'efectivo'
                               WHEN 'cash_bs'  THEN 'efectivo_bs'
                               -- ELSE explícito: sin él un CASE sin rama devuelve
                               -- NULL, y consultation_payments.payment_method es
                               -- NOT NULL. El WHERE ya lo evita; esto es el cinturón.
                               ELSE ${column}
                             END
           WHERE ${column} IN ('cash_usd', 'cash_bs')
        `);
      }

      // --- 2. profiles.payment_methods (TEXT[]) -------------------------------
      // Se reemplaza y DESPUÉS se deduplica: un perfil con 'cash_usd' Y 'efectivo'
      // quedaría con 'efectivo' dos veces, y el editor lo pintaría repetido.
      // El orden original se conserva (ORDER BY la primera aparición) porque es
      // el que decide cómo se listan los métodos en la reserva pública.
      await q(`
        UPDATE profiles
           SET payment_methods = ARRAY(
                 SELECT x FROM (
                   SELECT x, MIN(ord) AS ord
                     FROM unnest(
                            array_replace(
                              array_replace(payment_methods, 'cash_usd', 'efectivo'),
                              'cash_bs', 'efectivo_bs')
                          ) WITH ORDINALITY AS t(x, ord)
                    GROUP BY x
                 ) s ORDER BY s.ord
               )
         WHERE payment_methods && ARRAY['cash_usd', 'cash_bs']::text[]
      `);

      // --- 3. profiles.payment_details (JSONB indexado POR MÉTODO) ------------
      // Sin esto los datos que el especialista cargó para ese método quedan
      // huérfanos: la clave vieja deja de leerse y la nueva nace vacía.
      await q(renameJsonbKey('profiles', 'payment_details', 'cash_usd', 'efectivo'));
      await q(renameJsonbKey('profiles', 'payment_details', 'cash_bs', 'efectivo_bs'));
    });
  },

  /**
   * La vuelta atrás NO es simétrica a propósito.
   *
   * Antes de esta migración `efectivo` y `cash_usd` convivían de verdad: ambos
   * existían en la BD escritos por pantallas distintas. Revertir en bloque
   * marcaría como `cash_usd` filas que nacieron en español, inventando historia
   * que nunca pasó. Se deja el dato unificado —que es válido para las dos
   * versiones del código, porque la lectura entiende ambos— y solo se revierte
   * el código.
   */
  async down() {
    // Intencionalmente vacío. Ver el comentario de arriba.
  },
};
