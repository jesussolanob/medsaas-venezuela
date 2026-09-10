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
 * Ver ADR del lote de paquete pagado y `memory-bank/06-mvp-planning.md`.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const q = queryInterface.sequelize;

    // --- 1. appointments.plan_id -------------------------------------------------
    await queryInterface.addColumn('appointments', 'plan_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'pricing_plans', key: 'id' },
      // SET NULL y no CASCADE: borrar un servicio del catálogo NO puede borrar la cita
      // ni el historial de lo que se cobró.
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addIndex('appointments', ['plan_id'], {
      name: 'idx_appointments_plan_id',
    });

    // Backfill SOLO de los nombres inequívocos (HAVING COUNT(*) = 1).
    await q.query(`
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
         AND a.plan_id IS NULL
    `);

    // --- 2. appointment_changes_log: cambios que no son de estado ----------------
    await queryInterface.addColumn('appointment_changes_log', 'change_type', {
      type: Sequelize.STRING(20),
      allowNull: false,
      // 'status' para que las filas históricas queden correctamente clasificadas:
      // hasta hoy la tabla SOLO registraba transiciones de estado.
      defaultValue: 'status',
    });

    await queryInterface.changeColumn('appointment_changes_log', 'new_status', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });

    await queryInterface.addColumn('appointment_changes_log', 'old_value', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('appointment_changes_log', 'new_value', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    const q = queryInterface.sequelize;

    // Las filas de cambio de servicio no tienen estado: no pueden sobrevivir a un
    // new_status NOT NULL. Se borran antes de restaurar la restricción.
    await q.query(`DELETE FROM appointment_changes_log WHERE new_status IS NULL`);

    await queryInterface.removeColumn('appointment_changes_log', 'new_value');
    await queryInterface.removeColumn('appointment_changes_log', 'old_value');
    await queryInterface.removeColumn('appointment_changes_log', 'change_type');
    await queryInterface.changeColumn('appointment_changes_log', 'new_status', {
      type: Sequelize.STRING(20),
      allowNull: false,
    });

    await queryInterface.removeIndex('appointments', 'idx_appointments_plan_id');
    await queryInterface.removeColumn('appointments', 'plan_id');
  },
};
