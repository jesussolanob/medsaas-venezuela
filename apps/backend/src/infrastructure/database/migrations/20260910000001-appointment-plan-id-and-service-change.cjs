'use strict';

/**
 * Migration: 20260910000001-appointment-plan-id-and-service-change
 *
 * Habilita corregir el servicio elegido en una cita.
 *
 * 1) `appointments.plan_id` — hoy la cita guarda SOLO el snapshot `plan_name`/`plan_price`,
 *    y todo lo que necesita saber a qué servicio pertenece lo resuelve UNIENDO POR NOMBRE
 *    (`AND pp.name = a.plan_name`, tres veces en el repositorio de consultas). Dos servicios
 *    homónimos, o uno renombrado, devuelven el plan equivocado. Con `plan_id` el vínculo
 *    pasa a ser por identidad. El snapshot NO se toca: sigue siendo lo que se cobró.
 *
 *    Se rellena solo donde el nombre es INEQUÍVOCO (un único plan con ese nombre para ese
 *    doctor). Si el especialista repitió el nombre, queda NULL a propósito: adivinar sería
 *    exactamente el error que esta columna viene a eliminar.
 *
 * 2) `appointment_changes_log` deja de servir solo para cambios de ESTADO. Un cambio de
 *    servicio mueve dinero (el monto del pago se ajusta) y necesita el mismo rastro:
 *    quién, cuándo, de qué a qué. Se agrega `change_type` + `old_value`/`new_value`, y
 *    `new_status` pasa a aceptar NULL porque en un cambio de servicio el estado no se mueve.
 *
 * TODO va en UNA transacción y con `IF NOT EXISTS`: en Postgres el DDL es transaccional,
 * así que un fallo a mitad no deja la tabla medio migrada, y un reintento tras un fallo de
 * red tampoco choca contra lo ya creado. Una migración trabada bloquea TODOS los deploys.
 *
 * Ver `memory-bank/06-mvp-planning.md` — lote de paquete pagado.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      // --- 1. appointments.plan_id ---------------------------------------------
      // SET NULL y no CASCADE: borrar un servicio del catálogo NO puede borrar la
      // cita ni el historial de lo que se cobró.
      await q(`
        ALTER TABLE appointments
          ADD COLUMN IF NOT EXISTS plan_id UUID NULL
            REFERENCES pricing_plans(id) ON DELETE SET NULL;
      `);

      await q(`
        CREATE INDEX IF NOT EXISTS idx_appointments_plan_id
          ON appointments (plan_id);
      `);

      // Backfill SOLO de los nombres inequívocos (HAVING COUNT(*) = 1).
      await q(`
        UPDATE appointments a
           SET plan_id = m.plan_id
          FROM (
            SELECT pp.doctor_id,
                   pp.name,
                   MIN(pp.id::text)::uuid AS plan_id
              FROM pricing_plans pp
             GROUP BY pp.doctor_id, pp.name
            HAVING COUNT(*) = 1
          ) m
         WHERE a.doctor_id = m.doctor_id
           AND a.plan_name = m.name
           AND a.plan_id IS NULL;
      `);

      // --- 2. appointment_changes_log: cambios que no son de estado -------------
      // El default 'status' deja correctamente clasificadas las filas históricas:
      // hasta hoy la tabla SOLO registraba transiciones de estado.
      await q(`
        ALTER TABLE appointment_changes_log
          ADD COLUMN IF NOT EXISTS change_type VARCHAR(20) NOT NULL DEFAULT 'status',
          ADD COLUMN IF NOT EXISTS old_value TEXT NULL,
          ADD COLUMN IF NOT EXISTS new_value TEXT NULL;
      `);

      // En un cambio de servicio el estado no se mueve, así que new_status va NULL.
      await q(`
        ALTER TABLE appointment_changes_log
          ALTER COLUMN new_status DROP NOT NULL;
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      // Las filas de cambio de servicio no tienen estado: no pueden sobrevivir a un
      // new_status NOT NULL. Se borran antes de restaurar la restricción.
      await q(`DELETE FROM appointment_changes_log WHERE new_status IS NULL;`);
      await q(`
        ALTER TABLE appointment_changes_log
          ALTER COLUMN new_status SET NOT NULL;
      `);
      await q(`
        ALTER TABLE appointment_changes_log
          DROP COLUMN IF EXISTS new_value,
          DROP COLUMN IF EXISTS old_value,
          DROP COLUMN IF EXISTS change_type;
      `);

      await q(`DROP INDEX IF EXISTS idx_appointments_plan_id;`);
      await q(`ALTER TABLE appointments DROP COLUMN IF EXISTS plan_id;`);
    });
  },
};
