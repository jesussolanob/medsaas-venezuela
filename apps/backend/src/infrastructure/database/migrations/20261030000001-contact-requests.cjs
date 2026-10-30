'use strict';

/**
 * Migration: 20261030000001-contact-requests
 *
 * Phase 1 of the specialist-retention plan — "Contáctame ya".
 *
 * CREATES:
 *   - `contact_requests` table: records support contact requests from specialists.
 *   - Partial UNIQUE index on (doctor_id) WHERE status = 'pending'.
 *   - Composite index on (status, created_at DESC).
 *
 * SEEDS:
 *   - `app_settings`: support_whatsapp_number, support_hours (ON CONFLICT DO NOTHING).
 *   - `email_templates`: support_contact_request (ON CONFLICT (name) DO NOTHING).
 *
 * NOTES:
 *   - Postgres does NOT support ADD CONSTRAINT IF NOT EXISTS; constraints are
 *     created inline in CREATE TABLE, so re-running the migration is safe (the
 *     table already exists → CREATE TABLE IF NOT EXISTS is a no-op).
 *   - The partial UNIQUE index uses CREATE UNIQUE INDEX IF NOT EXISTS.
 *   - app_settings uses ON CONFLICT (key) DO NOTHING; email_templates uses
 *     ON CONFLICT (name) DO NOTHING — never overwrites admin edits.
 *
 * @type {import('sequelize-cli').Migration}
 */

const SUPPORT_CONTACT_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Solicitud de contacto</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    table { border-collapse: collapse; width: 100%; max-width: 520px; font-family: sans-serif; font-size: 14px; margin: 16px 0; }
    td { padding: 8px 12px; border: 1px solid #e2e8f0; }
    td:first-child { font-weight: bold; background: #f8fafc; width: 40%; }
    .promise { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px; padding: 12px 16px; color: #0f766e; font-weight: 600; margin: 16px 0; }
    .cta { display: inline-block; background: #0d9488; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{urgentPrefix}}Solicitud de contacto de {{doctorName}}</h1>
    </div>
    <div class="body">
      <p>Un especialista ha solicitado que el equipo de Delta lo contacte.</p>
      <table>
        <tr><td>Nombre</td><td>{{doctorName}}</td></tr>
        <tr><td>Plan</td><td>{{doctorPlan}}</td></tr>
        <tr><td>Especialidad</td><td>{{doctorSpecialty}}</td></tr>
        <tr><td>Teléfono</td><td>{{doctorPhone}}</td></tr>
        <tr><td>Correo</td><td>{{doctorEmail}}</td></tr>
        <tr><td>Canal preferido</td><td>{{channelLabel}}</td></tr>
        <tr><td>Mensaje</td><td>{{messageText}}</td></tr>
      </table>
      <div class="promise">Compromiso: {{promise}}</div>
      <a href="{{adminUrl}}" class="cta">Ver solicitud en el panel</a>
    </div>
    <div class="footer">
      <p>Este correo fue generado automáticamente por Delta Salud. No responder directamente a este mensaje.</p>
    </div>
  </div>
</body>
</html>`;

const SUPPORT_CONTACT_TEXT = `{{urgentPrefix}}Solicitud de contacto de {{doctorName}}

Un especialista ha solicitado que el equipo lo contacte.

Nombre        : {{doctorName}}
Plan          : {{doctorPlan}}
Especialidad  : {{doctorSpecialty}}
Teléfono      : {{doctorPhone}}
Correo        : {{doctorEmail}}
Canal         : {{channelLabel}}
Mensaje       : {{messageText}}

Compromiso    : {{promise}}

Ver solicitud : {{adminUrl}}`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) =>
        queryInterface.sequelize.query(sql, { transaction, ...opts });

      // ------------------------------------------------------------------
      // 1. contact_requests table
      // ------------------------------------------------------------------
      await q(`
        CREATE TABLE IF NOT EXISTS contact_requests (
          id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          doctor_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          channel            TEXT        NOT NULL CHECK (channel IN ('call_now','whatsapp','call','email')),
          message            TEXT        NULL CHECK (char_length(message) <= 500),
          status             TEXT        NOT NULL DEFAULT 'pending'
                                         CHECK (status IN ('pending','contacted','resolved')),
          handled_by         UUID        NULL REFERENCES profiles(id) ON DELETE SET NULL,
          handled_at         TIMESTAMPTZ NULL,
          notes              TEXT        NULL,
          notification_count INT         NOT NULL DEFAULT 0,
          last_notified_at   TIMESTAMPTZ NULL,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // ------------------------------------------------------------------
      // 2. Partial UNIQUE index: max one pending request per doctor
      // ------------------------------------------------------------------
      await q(`
        CREATE UNIQUE INDEX IF NOT EXISTS contact_requests_doctor_pending_uniq
          ON contact_requests (doctor_id)
         WHERE status = 'pending'
      `);

      // ------------------------------------------------------------------
      // 3. Composite index for admin list queries
      // ------------------------------------------------------------------
      await q(`
        CREATE INDEX IF NOT EXISTS contact_requests_status_created_idx
          ON contact_requests (status, created_at DESC)
      `);

      // ------------------------------------------------------------------
      // 4. Seed app_settings (ON CONFLICT DO NOTHING — never overwrites)
      // ------------------------------------------------------------------
      await q(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES
           ('support_whatsapp_number', '584221033582', NOW()),
           ('support_hours', :hoursJson, NOW())
         ON CONFLICT (key) DO NOTHING`,
        {
          replacements: {
            hoursJson: JSON.stringify({
              days: [1, 2, 3, 4, 5, 6],
              start: '08:00',
              end: '18:00',
              timezone: 'America/Caracas',
            }),
          },
        },
      );

      // ------------------------------------------------------------------
      // 5. Seed email_templates (ON CONFLICT (name) DO NOTHING)
      // ------------------------------------------------------------------
      const now = new Date();
      await q(
        `INSERT INTO email_templates
           (id, name, subject, html, text, description, is_active, created_at, updated_at)
         VALUES
           (gen_random_uuid(),
            'support_contact_request',
            '{{urgentPrefix}}Solicitud de contacto de {{doctorName}}',
            :html, :text,
            'Notification sent to all super_admins when a specialist requests support contact.',
            true, :now, :now)
         ON CONFLICT (name) DO NOTHING`,
        {
          replacements: {
            html: SUPPORT_CONTACT_HTML,
            text: SUPPORT_CONTACT_TEXT,
            now,
          },
        },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      // Remove email template
      await q(`DELETE FROM email_templates WHERE name = 'support_contact_request'`);

      // Remove app_settings seeded here (only if they still hold the seeded value,
      // to avoid deleting admin customisations)
      await q(`
        DELETE FROM app_settings
         WHERE key = 'support_whatsapp_number'
           AND value = '584221033582'
      `);
      await q(`
        DELETE FROM app_settings
         WHERE key = 'support_hours'
      `);

      // Drop indexes then table
      await q(`DROP INDEX IF EXISTS contact_requests_status_created_idx`);
      await q(`DROP INDEX IF EXISTS contact_requests_doctor_pending_uniq`);
      await q(`DROP TABLE IF EXISTS contact_requests`);
    });
  },
};
