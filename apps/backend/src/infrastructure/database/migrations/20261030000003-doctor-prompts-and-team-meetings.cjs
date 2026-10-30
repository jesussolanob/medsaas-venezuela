'use strict';

/**
 * Migration: 20261030000003-doctor-prompts-and-team-meetings
 *
 * Phase 3 of the specialist-retention plan — "Queremos conocerte" modal +
 * team meeting scheduling inside Delta.
 *
 * CREATES:
 *   - `doctor_prompts` table: generic per-doctor lifecycle-event tracking.
 *     UNIQUE (doctor_id, prompt_key).
 *   - `team_meetings` table: records scheduled meetings between the team and a
 *     specialist.
 *     Partial UNIQUE index: one 'scheduled' meeting per doctor at a time.
 *
 * SEEDS (ON CONFLICT DO NOTHING — never overwrites admin edits):
 *   - `app_settings`: meeting_prompt_enabled, meeting_prompt_min_days,
 *     meeting_prompt_snooze_days, meeting_prompt_max_shows,
 *     team_meeting_host_profile_id.
 *   - `email_templates`: team_meeting_confirmed, team_meeting_rescheduled,
 *     team_meeting_cancelled, team_meeting_reminder.
 *
 * NOTES:
 *   - Postgres has NO ADD CONSTRAINT IF NOT EXISTS; all constraints are inline
 *     inside CREATE TABLE IF NOT EXISTS (idempotent on re-run).
 *   - The `q` helper always forwards `opts` so `down` replacements work:
 *       (sql, opts = {}) => query(sql, { transaction, ...opts })
 *
 * @type {import('sequelize-cli').Migration}
 */

// ---------------------------------------------------------------------------
// Email template HTML/text bodies
// ---------------------------------------------------------------------------

const MEETING_CONFIRMED_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reunión confirmada</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .info-box { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px; padding: 16px 20px; margin: 16px 0; }
    .info-box strong { color: #0f766e; }
    .cta { display: inline-block; background: #0d9488; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reunión confirmada con {{doctorName}}</h1>
    </div>
    <div class="body">
      <p>Se ha confirmado una reunión con el especialista <strong>{{doctorName}}</strong>.</p>
      <div class="info-box">
        <p><strong>Fecha y hora:</strong> {{startsAtText}}</p>
        <p><strong>Duración:</strong> 30 minutos</p>
        <p><strong>Link de videollamada:</strong> <a href="{{meetingUrl}}">{{meetingUrl}}</a></p>
      </div>
      <a href="{{manageUrl}}" class="cta">Ir a Delta</a>
    </div>
    <div class="footer">
      <p>Este correo fue generado automáticamente por Delta Salud.</p>
    </div>
  </div>
</body>
</html>`;

const MEETING_CONFIRMED_TEXT = `Reunión confirmada con {{doctorName}}

Especialista : {{doctorName}}
Fecha y hora : {{startsAtText}}
Duración     : 30 minutos
Videollamada : {{meetingUrl}}

Ir a Delta   : {{manageUrl}}`;

const MEETING_RESCHEDULED_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reunión reprogramada</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0284c7; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .info-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 16px 20px; margin: 16px 0; }
    .info-box strong { color: #0369a1; }
    .cta { display: inline-block; background: #0d9488; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reunión reprogramada con {{doctorName}}</h1>
    </div>
    <div class="body">
      <p>El especialista <strong>{{doctorName}}</strong> ha reprogramado la reunión.</p>
      <div class="info-box">
        <p><strong>Nueva fecha y hora:</strong> {{startsAtText}}</p>
        <p><strong>Duración:</strong> 30 minutos</p>
        <p><strong>Link de videollamada:</strong> <a href="{{meetingUrl}}">{{meetingUrl}}</a></p>
      </div>
      <a href="{{manageUrl}}" class="cta">Ir a Delta</a>
    </div>
    <div class="footer">
      <p>Este correo fue generado automáticamente por Delta Salud.</p>
    </div>
  </div>
</body>
</html>`;

const MEETING_RESCHEDULED_TEXT = `Reunión reprogramada con {{doctorName}}

Especialista     : {{doctorName}}
Nueva fecha/hora : {{startsAtText}}
Duración         : 30 minutos
Videollamada     : {{meetingUrl}}

Ir a Delta       : {{manageUrl}}`;

const MEETING_CANCELLED_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reunión cancelada</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #dc2626; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .cta { display: inline-block; background: #0d9488; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reunión cancelada con {{doctorName}}</h1>
    </div>
    <div class="body">
      <p>El especialista <strong>{{doctorName}}</strong> ha cancelado la reunión que estaba agendada para <strong>{{startsAtText}}</strong>.</p>
      <p>El especialista puede volver a agendar la reunión en cualquier momento desde su panel.</p>
      <a href="{{manageUrl}}" class="cta">Ver en Delta</a>
    </div>
    <div class="footer">
      <p>Este correo fue generado automáticamente por Delta Salud.</p>
    </div>
  </div>
</body>
</html>`;

const MEETING_CANCELLED_TEXT = `Reunión cancelada con {{doctorName}}

El especialista {{doctorName}} ha cancelado la reunión agendada para {{startsAtText}}.
Puede volver a agendar la reunión desde su panel.

Ver en Delta : {{manageUrl}}`;

const MEETING_REMINDER_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recordatorio de reunión</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #7c3aed; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .info-box { background: #faf5ff; border: 1px solid #ddd6fe; border-radius: 6px; padding: 16px 20px; margin: 16px 0; }
    .info-box strong { color: #6d28d9; }
    .cta { display: inline-block; background: #7c3aed; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Recordatorio: reunión con {{doctorName}}</h1>
    </div>
    <div class="body">
      <p>Recordatorio de la reunión programada con el especialista <strong>{{doctorName}}</strong>.</p>
      <div class="info-box">
        <p><strong>Fecha y hora:</strong> {{startsAtText}}</p>
        <p><strong>Duración:</strong> 30 minutos</p>
        <p><strong>Link de videollamada:</strong> <a href="{{meetingUrl}}">Unirse a la reunión</a></p>
      </div>
      <a href="{{meetingUrl}}" class="cta">Unirse ahora</a>
    </div>
    <div class="footer">
      <p>Este correo fue generado automáticamente por Delta Salud.</p>
    </div>
  </div>
</body>
</html>`;

const MEETING_REMINDER_TEXT = `Recordatorio: reunión con {{doctorName}}

Especialista : {{doctorName}}
Fecha y hora : {{startsAtText}}
Duración     : 30 minutos
Videollamada : {{meetingUrl}}

Unirse       : {{meetingUrl}}`;


// ---------------------------------------------------------------------------
// Doctor-facing copies. The templates above are written for the TEAM ("una
// reunión con el especialista {{doctorName}}") and are seeded as *_admin; the
// doctor gets these, addressed to him.
// ---------------------------------------------------------------------------
const doctorHtml = (title, intro, extra) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .info-box { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px; padding: 16px 20px; margin: 16px 0; }
    .info-box strong { color: #0f766e; }
    .cta { display: inline-block; background: #0d9488; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${title}</h1></div>
    <div class="body">
      <p>Hola {{doctorName}},</p>
      <p>${intro}</p>
      <div class="info-box">
        <p><strong>Fecha y hora:</strong> {{startsAtText}}</p>
        <p><strong>Duración:</strong> 30 minutos</p>
        <p><strong>Videollamada:</strong> <a href="{{meetingUrl}}">{{meetingUrl}}</a></p>
      </div>
      <p>${extra}</p>
      <a class="cta" href="{{manageUrl}}">Ir a mi Inicio</a>
    </div>
    <div class="footer">Este correo fue generado automáticamente por Delta Salud.</div>
  </div>
</body>
</html>`;
const doctorText = (title, intro, extra) => `${title}

Hola {{doctorName}},
${intro}

Fecha y hora : {{startsAtText}}
Duración     : 30 minutos
Videollamada : {{meetingUrl}}

${extra}
Ir a mi Inicio: {{manageUrl}}`;

const DOCTOR_TEMPLATES = [
  {
    name: 'team_meeting_confirmed',
    subject: 'Tu reunión con el equipo Delta está confirmada',
    title: 'Tu reunión está confirmada',
    intro:
      '¡Gracias! Agendaste 30 minutos con el equipo de Delta Salud para conocerte y escuchar tu experiencia. Como agradecimiento, te regalaremos un mes más de Delta.',
    extra:
      'Esa hora quedó bloqueada en tu agenda y te llegará la invitación de calendario. Puedes reprogramarla o cancelarla desde tu Inicio hasta 2 horas antes.',
    description: 'Sent to the doctor when he books a meeting with the Delta team.',
  },
  {
    name: 'team_meeting_rescheduled',
    subject: 'Tu reunión con el equipo Delta cambió de horario',
    title: 'Tu reunión cambió de horario',
    intro: 'Tu reunión con el equipo de Delta Salud quedó en el nuevo horario.',
    extra: 'Actualizamos el bloqueo en tu agenda y la invitación de calendario.',
    description: 'Sent to the doctor when his meeting with the Delta team is rescheduled.',
  },
  {
    name: 'team_meeting_cancelled',
    subject: 'Tu reunión con el equipo Delta fue cancelada',
    title: 'Tu reunión fue cancelada',
    intro: 'La reunión con el equipo de Delta Salud que tenías agendada fue cancelada.',
    extra:
      'Liberamos esa hora en tu agenda. Si quieres agendar otra, la invitación volverá a aparecer en tu Inicio.',
    description: 'Sent to the doctor when his meeting with the Delta team is cancelled.',
  },
  {
    name: 'team_meeting_reminder',
    subject: 'Recordatorio: tu reunión con el equipo Delta',
    title: 'Recordatorio de tu reunión',
    intro: 'Te recordamos tu reunión con el equipo de Delta Salud.',
    extra: 'Si no puedes asistir, reprográmala desde tu Inicio (hasta 2 horas antes).',
    description: 'Sent to the doctor 24h and 1h before his meeting with the Delta team.',
  },
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) =>
        queryInterface.sequelize.query(sql, { transaction, ...opts });

      // ------------------------------------------------------------------
      // 1. doctor_prompts table
      // ------------------------------------------------------------------
      await q(`
        CREATE TABLE IF NOT EXISTS doctor_prompts (
          id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          doctor_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          prompt_key      TEXT        NOT NULL,
          shown_count     INT         NOT NULL DEFAULT 0,
          first_shown_at  TIMESTAMPTZ NULL,
          last_shown_at   TIMESTAMPTZ NULL,
          acted_at        TIMESTAMPTZ NULL,
          snoozed_until   TIMESTAMPTZ NULL,
          dismissed_at    TIMESTAMPTZ NULL,
          metadata        JSONB       NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (doctor_id, prompt_key)
        )
      `);

      await q(`
        CREATE INDEX IF NOT EXISTS doctor_prompts_doctor_id_idx
          ON doctor_prompts (doctor_id)
      `);

      // ------------------------------------------------------------------
      // 2. team_meetings table
      // ------------------------------------------------------------------
      await q(`
        CREATE TABLE IF NOT EXISTS team_meetings (
          id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          doctor_id               UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          starts_at               TIMESTAMPTZ NOT NULL,
          ends_at                 TIMESTAMPTZ NOT NULL,
          CHECK (ends_at > starts_at),
          status                  TEXT        NOT NULL DEFAULT 'scheduled'
                                    CHECK (status IN ('scheduled','done','no_show','cancelled')),
          meeting_url             TEXT        NULL,
          external_event_id       TEXT        NULL,
          availability_block_id   UUID        NULL
                                    REFERENCES doctor_availability_blocks(id) ON DELETE SET NULL,
          source                  TEXT        NOT NULL
                                    CHECK (source IN ('email','modal')),
          notes                   TEXT        NULL,
          reminder_24h_sent_at    TIMESTAMPTZ NULL,
          reminder_1h_sent_at     TIMESTAMPTZ NULL,
          created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // Partial UNIQUE index: at most one 'scheduled' meeting per doctor
      await q(`
        CREATE UNIQUE INDEX IF NOT EXISTS team_meetings_doctor_scheduled_uniq
          ON team_meetings (doctor_id)
         WHERE status = 'scheduled'
      `);

      await q(`
        CREATE INDEX IF NOT EXISTS team_meetings_starts_at_idx
          ON team_meetings (starts_at)
         WHERE status = 'scheduled'
      `);

      // ------------------------------------------------------------------
      // 3. Seed app_settings (ON CONFLICT DO NOTHING — never overwrites)
      // ------------------------------------------------------------------
      await q(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES
          ('meeting_prompt_enabled',       'true',  NOW()),
          ('meeting_prompt_min_days',      '3',     NOW()),
          ('meeting_prompt_snooze_days',   '1',     NOW()),
          ('meeting_prompt_max_shows',     '3',     NOW()),
          ('team_meeting_host_profile_id', '',      NOW())
        ON CONFLICT (key) DO NOTHING
      `);

      // ------------------------------------------------------------------
      // 4. Seed email_templates (ON CONFLICT (name) DO NOTHING)
      // ------------------------------------------------------------------
      const now = new Date();

      await q(
        `INSERT INTO email_templates
           (id, name, subject, html, text, description, is_active, created_at, updated_at)
         VALUES
           (gen_random_uuid(),
            'team_meeting_confirmed_admin',
            'Reunión confirmada con {{doctorName}}',
            :html, :text,
            'Confirmation email sent to the doctor and all super_admins when a team meeting is booked.',
            true, :now, :now)
         ON CONFLICT (name) DO NOTHING`,
        { replacements: { html: MEETING_CONFIRMED_HTML, text: MEETING_CONFIRMED_TEXT, now } },
      );

      await q(
        `INSERT INTO email_templates
           (id, name, subject, html, text, description, is_active, created_at, updated_at)
         VALUES
           (gen_random_uuid(),
            'team_meeting_rescheduled_admin',
            'Reunión reprogramada con {{doctorName}}',
            :html, :text,
            'Notification sent when a team meeting is rescheduled by the doctor.',
            true, :now, :now)
         ON CONFLICT (name) DO NOTHING`,
        { replacements: { html: MEETING_RESCHEDULED_HTML, text: MEETING_RESCHEDULED_TEXT, now } },
      );

      await q(
        `INSERT INTO email_templates
           (id, name, subject, html, text, description, is_active, created_at, updated_at)
         VALUES
           (gen_random_uuid(),
            'team_meeting_cancelled_admin',
            'Reunión cancelada con {{doctorName}}',
            :html, :text,
            'Notification sent when a team meeting is cancelled by the doctor.',
            true, :now, :now)
         ON CONFLICT (name) DO NOTHING`,
        { replacements: { html: MEETING_CANCELLED_HTML, text: MEETING_CANCELLED_TEXT, now } },
      );

      await q(
        `INSERT INTO email_templates
           (id, name, subject, html, text, description, is_active, created_at, updated_at)
         VALUES
           (gen_random_uuid(),
            'team_meeting_reminder_admin',
            'Recordatorio: reunión con {{doctorName}}',
            :html, :text,
            'Reminder email sent 24h and 1h before a scheduled team meeting.',
            true, :now, :now)
         ON CONFLICT (name) DO NOTHING`,
        { replacements: { html: MEETING_REMINDER_HTML, text: MEETING_REMINDER_TEXT, now } },
      );

      for (const t of DOCTOR_TEMPLATES) {
        await q(
          `INSERT INTO email_templates
             (id, name, subject, html, text, description, is_active, created_at, updated_at)
           VALUES (gen_random_uuid(), :name, :subject, :html, :text, :description, true, :now, :now)
           ON CONFLICT (name) DO NOTHING`,
          {
            replacements: {
              name: t.name,
              subject: t.subject,
              html: doctorHtml(t.title, t.intro, t.extra),
              text: doctorText(t.title, t.intro, t.extra),
              description: t.description,
              now,
            },
          },
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) =>
        queryInterface.sequelize.query(sql, { transaction, ...opts });

      // Remove email templates
      await q(`
        DELETE FROM email_templates
         WHERE name IN (
           'team_meeting_confirmed',
           'team_meeting_rescheduled',
           'team_meeting_cancelled',
           'team_meeting_reminder',
           'team_meeting_confirmed_admin',
           'team_meeting_rescheduled_admin',
           'team_meeting_cancelled_admin',
           'team_meeting_reminder_admin'
         )
      `);

      // Remove app_settings seeded here
      await q(`
        DELETE FROM app_settings
         WHERE key IN (
           'meeting_prompt_enabled',
           'meeting_prompt_min_days',
           'meeting_prompt_snooze_days',
           'meeting_prompt_max_shows',
           'team_meeting_host_profile_id'
         )
      `);

      // Drop indexes then tables
      await q(`DROP INDEX IF EXISTS team_meetings_starts_at_idx`);
      await q(`DROP INDEX IF EXISTS team_meetings_doctor_scheduled_uniq`);
      await q(`DROP TABLE IF EXISTS team_meetings`);
      await q(`DROP INDEX IF EXISTS doctor_prompts_doctor_id_idx`);
      await q(`DROP TABLE IF EXISTS doctor_prompts`);
    });
  },
};
