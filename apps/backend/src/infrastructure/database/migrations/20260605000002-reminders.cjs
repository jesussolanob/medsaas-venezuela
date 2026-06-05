/**
 * Migration: 20260605000002-reminders
 *
 * Creates two tables for the reminders module:
 *
 * 1. reminders_settings — doctor reminder config (one row per doctor, UNIQUE on doctor_id)
 * 2. reminders_queue    — scheduled reminder jobs (populated in Fase 6; read-only in Etapa 1)
 *
 * Uses TEXT + CHECK constraints instead of Postgres native enums for forward compatibility.
 *
 * Indexes:
 *   - idx_reminders_queue_doctor      ON reminders_queue(doctor_id)
 *   - idx_reminders_queue_status_time ON reminders_queue(status, scheduled_for)
 */

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    // -------------------------------------------------------------------------
    // 1. reminders_settings
    // -------------------------------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS reminders_settings (
        id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
        doctor_id             uuid        NOT NULL,
        enabled               boolean     NOT NULL DEFAULT true,
        channel               text        NOT NULL DEFAULT 'both'
                                          CHECK (channel IN ('whatsapp', 'email', 'both')),
        reminder_7d_enabled   boolean     NOT NULL DEFAULT true,
        reminder_24h_enabled  boolean     NOT NULL DEFAULT true,
        reminder_3h_enabled   boolean     NOT NULL DEFAULT true,
        reminder_1h_enabled   boolean     NOT NULL DEFAULT false,
        template_7d_whatsapp  text        NOT NULL DEFAULT 'Hola {patient_name}, te recordamos tu cita con el Dr. {doctor_name} el {date} a las {time}.',
        template_24h_whatsapp text        NOT NULL DEFAULT 'Hola {patient_name}, mañana tienes cita con el Dr. {doctor_name} a las {time}.',
        template_3h_whatsapp  text        NOT NULL DEFAULT 'Hola {patient_name}, en 3 horas tienes cita con el Dr. {doctor_name}.',
        quiet_hours_start     text        NOT NULL DEFAULT '21:00:00',
        quiet_hours_end       text        NOT NULL DEFAULT '08:00:00',
        created_at            timestamptz NOT NULL DEFAULT now(),
        updated_at            timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        UNIQUE (doctor_id),
        CONSTRAINT fk_reminders_settings_doctor
          FOREIGN KEY (doctor_id) REFERENCES profiles(id) ON DELETE CASCADE
      )
    `);

    // -------------------------------------------------------------------------
    // 2. reminders_queue
    // -------------------------------------------------------------------------
    await q.query(`
      CREATE TABLE IF NOT EXISTS reminders_queue (
        id              uuid        NOT NULL DEFAULT gen_random_uuid(),
        appointment_id  uuid        NOT NULL,
        doctor_id       uuid        NOT NULL,
        patient_id      uuid        NULL,
        offset_type     text        NULL,
        scheduled_for   timestamptz NOT NULL,
        channel         text        NULL
                                    CHECK (channel IN ('whatsapp', 'email', 'both')),
        message_body    text        NULL,
        status          text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
        attempts        integer     NOT NULL DEFAULT 0,
        last_attempt_at timestamptz NULL,
        sent_at         timestamptz NULL,
        error_message   text        NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id),
        CONSTRAINT fk_reminders_queue_appointment
          FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        CONSTRAINT fk_reminders_queue_doctor
          FOREIGN KEY (doctor_id) REFERENCES profiles(id) ON DELETE CASCADE,
        CONSTRAINT fk_reminders_queue_patient
          FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
      )
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_reminders_queue_doctor
        ON reminders_queue (doctor_id)
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_reminders_queue_status_time
        ON reminders_queue (status, scheduled_for)
    `);
  },

  async down(queryInterface, _Sequelize) {
    const q = queryInterface.sequelize;

    await q.query(`DROP INDEX IF EXISTS idx_reminders_queue_status_time`);
    await q.query(`DROP INDEX IF EXISTS idx_reminders_queue_doctor`);
    await q.query(`DROP TABLE IF EXISTS reminders_queue`);
    await q.query(`DROP TABLE IF EXISTS reminders_settings`);
  },
};
