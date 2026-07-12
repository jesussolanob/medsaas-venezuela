'use strict';

/**
 * Migration: 20260712000000-backfill-consultations-round2
 *
 * Segundo pase del backfill de consultas (ver 20260711000002). Necesario porque
 * entre el primer backfill y el fix de generación de código (getMaxSequenceForMonth),
 * las citas creadas en meses YA POBLADOS (p.ej. julio) fallaban silenciosamente al
 * auto-crear su consulta (la secuencia count+1 colisionaba y agotaba los reintentos).
 *
 * Crea la fila `consultations` que falta para cada cita con paciente, no cancelada
 * y sin consulta ligada. consultation_code DLT-AAAAMM-XXXX con secuencia sobre el
 * MÁXIMO GLOBAL del mes (collision-free). Campos clínicos en NULL (cifrados).
 * Enlaza appointments.consultation_id. Idempotente (NOT EXISTS) — corre una vez.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    await q.query(`
      INSERT INTO consultations (
        id, doctor_id, patient_id, appointment_id, consultation_code,
        consultation_date, payment_status, amount, created_at, updated_at
      )
      SELECT
        gen_random_uuid(),
        m.doctor_id,
        m.patient_id,
        m.appt_id,
        'DLT-' || m.ym || '-' || lpad((m.base_seq + m.rn)::text, 4, '0'),
        m.scheduled_at,
        'pending',
        m.plan_price,
        now(),
        now()
      FROM (
        SELECT
          a.id            AS appt_id,
          a.doctor_id     AS doctor_id,
          a.patient_id    AS patient_id,
          a.scheduled_at  AS scheduled_at,
          a.plan_price    AS plan_price,
          to_char(a.scheduled_at, 'YYYYMM') AS ym,
          row_number() OVER (
            PARTITION BY to_char(a.scheduled_at, 'YYYYMM')
            ORDER BY a.scheduled_at, a.id
          ) AS rn,
          COALESCE((
            SELECT MAX(
              (substring(c.consultation_code from '^DLT-[0-9]{6}-([0-9]+)$'))::int
            )
            FROM consultations c
            WHERE c.consultation_code LIKE 'DLT-' || to_char(a.scheduled_at, 'YYYYMM') || '-%'
          ), 0) AS base_seq
        FROM appointments a
        WHERE a.patient_id IS NOT NULL
          AND a.consultation_id IS NULL
          AND a.status <> 'cancelled'
          AND NOT EXISTS (
            SELECT 1 FROM consultations c2 WHERE c2.appointment_id = a.id
          )
      ) m
    `);

    await q.query(`
      UPDATE appointments a
         SET consultation_id = c.id,
             updated_at = now()
        FROM consultations c
       WHERE c.appointment_id = a.id
         AND a.consultation_id IS NULL
    `);
  },

  async down() {
    // No-op: revertir el backfill (borrar consultas) es riesgoso.
  },
};
