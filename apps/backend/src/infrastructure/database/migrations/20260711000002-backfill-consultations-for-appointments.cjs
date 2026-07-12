'use strict';

/**
 * Migration: 20260711000002-backfill-consultations-for-appointments
 *
 * BACKFILL (una sola vez). Antes del fix 2026-07-11, la fila `consultations`
 * solo se creaba cuando la cita pasaba a `confirmed`. Las citas `scheduled`
 * ("por confirmar") y las del link público quedaban SIN consulta → no aparecían
 * en el módulo Consultas ni sumaban a "Por ingresar".
 *
 * Esta migración crea la fila `consultations` que falta para cada cita que:
 *   - tiene patient_id (paciente conocido),
 *   - NO está cancelada,
 *   - y NO tiene consulta ligada (appointments.consultation_id NULL y sin
 *     consultations.appointment_id apuntando a ella).
 *
 * Campos que llena:
 *   - doctor_id, patient_id, appointment_id
 *   - consultation_code: DLT-AAAAMM-XXXX. XXXX se calcula sobre el MÁXIMO GLOBAL
 *     del mes (consultation_code tiene UNIQUE global) + row_number() por mes, así
 *     no colisiona ni con los existentes ni entre sí.
 *   - consultation_date = appointments.scheduled_at
 *   - payment_status = 'pending', amount = appointments.plan_price (para "Por ingresar")
 *   - campos clínicos (chief_complaint/diagnosis/treatment/notes) => NULL.
 *     Están cifrados en la capa de repositorio (AES-256-GCM); insertar texto plano
 *     por SQL rompería el descifrado al leer. El doctor los llena al abrir la consulta.
 *
 * Luego enlaza appointments.consultation_id a la fila creada.
 *
 * Idempotente por el guard NOT EXISTS + corre una sola vez (SequelizeMeta).
 * down(): no revierte (borrar consultas creadas por el doctor sería riesgoso);
 * si hiciera falta, se limpia manualmente identificando las de clínica vacía.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // 1. Crear la consulta faltante para cada cita elegible.
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
              (substring(c.consultation_code from '^DLT-\\d{6}-(\\d+)$'))::int
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

    // 2. Enlazar la cita con su nueva consulta.
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
    // No-op: revertir el backfill (borrar consultas) es riesgoso. Ver cabecera.
  },
};
