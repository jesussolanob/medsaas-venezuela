'use strict';

/**
 * Migration: 20260720000001-reminders-auto-dispatch
 *
 * Three changes in a single migration:
 *
 * 1. UNIQUE(appointment_id, offset_type) on reminders_queue.
 *    The queue is empty in production, so this is safe. The dispatch use-case
 *    relies on "ON CONFLICT DO NOTHING" for idempotency — without this
 *    constraint the idempotency check falls back to the NOT EXISTS sub-query
 *    but the RETURNING clause after ON CONFLICT requires the constraint.
 *
 * 2. Change default of reminder_1h_enabled in reminders_settings to TRUE and
 *    UPDATE all existing rows to true.
 *    No doctor has intentionally set this column to false — the prior default
 *    of false was a placeholder. Changing it to true matches the new
 *    REMINDERS_SETTINGS_DEFAULTS and enables 1h reminders out of the box.
 *
 * 3. Seed two email templates used by DispatchDueRemindersUseCase:
 *    - reminder_confirm_24h : 24h reminder with branded "Confirmar mi cita" button.
 *    - reminder_1h          : 1h reminder, simple branded copy.
 *    Both are idempotent: ON CONFLICT (name) DO UPDATE so they can be re-run
 *    after copy/style tweaks without failing.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    // ------------------------------------------------------------------
    // 1. UNIQUE constraint on reminders_queue(appointment_id, offset_type)
    // ------------------------------------------------------------------
    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       ADD CONSTRAINT ux_reminders_queue_appt_offset
       UNIQUE (appointment_id, offset_type)`,
    );

    // ------------------------------------------------------------------
    // 2. Change reminder_1h_enabled default + backfill existing rows
    // ------------------------------------------------------------------
    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_settings
       ALTER COLUMN reminder_1h_enabled SET DEFAULT TRUE`,
    );

    await queryInterface.sequelize.query(
      `UPDATE reminders_settings SET reminder_1h_enabled = TRUE`,
    );

    // ------------------------------------------------------------------
    // 3. Seed email templates
    // ------------------------------------------------------------------

    // ---- reminder_confirm_24h -----------------------------------------
    const html24h = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recordatorio y confirmaci&oacute;n de cita</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { margin: 0; font-size: 13px; opacity: 0.88; }
    .body { padding: 32px; }
    .body p { line-height: 1.65; font-size: 15px; color: #334155; margin: 0 0 16px; }
    .info-box { background: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 6px; padding: 18px 22px; margin: 24px 0; }
    .info-box p { margin: 5px 0; font-size: 14px; color: #0f766e; }
    .info-box p strong { color: #0d9488; }
    .btn-wrap { text-align: center; margin: 28px 0 16px; }
    .btn { display: inline-block; background: #0d9488; color: #ffffff !important; text-decoration: none; font-size: 16px; font-weight: 700; padding: 14px 36px; border-radius: 8px; letter-spacing: 0.2px; }
    .link-fallback { font-size: 12px; color: #64748b; text-align: center; margin-top: 8px; word-break: break-all; }
    .link-fallback a { color: #0d9488; }
    .tip { font-size: 13px; color: #64748b; background: #f8fafc; border-radius: 6px; padding: 12px 16px; margin-top: 20px; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Salud</h1>
      <p>Recordatorio de tu cita m&eacute;dica</p>
    </div>
    <div class="body">
      <p>Hola, <strong>{{patient_name}}</strong></p>
      <p>Te recordamos que ma&ntilde;ana tienes una cita m&eacute;dica. Por favor conf&iacute;rmala para que tu m&eacute;dico est&eacute; preparado para recibirte.</p>
      <div class="info-box">
        <p><strong>M&eacute;dico:</strong> {{doctor_name}}</p>
        <p><strong>Fecha:</strong> {{date}}</p>
        <p><strong>Hora:</strong> {{time}}</p>
      </div>
      <div class="btn-wrap">
        <a href="{{confirm_url}}" class="btn" style="color:#ffffff">Confirmar mi cita</a>
      </div>
      <p class="link-fallback">
        Si el bot&oacute;n no funciona, copia y pega este enlace en tu navegador:<br />
        <a href="{{confirm_url}}">{{confirm_url}}</a>
      </p>
      <p class="tip">Si no podr&aacute;s asistir, por favor contacta a tu m&eacute;dico lo antes posible para cancelar o reprogramar tu cita.</p>
    </div>
    <div class="footer">
      Delta Salud &mdash; Sistema de Gesti&oacute;n M&eacute;dica &nbsp;&bull;&nbsp; Este es un mensaje autom&aacute;tico, por favor no respondas a este correo.
    </div>
  </div>
</body>
</html>`;

    const text24h = [
      'Recordatorio de cita — Delta Salud',
      '',
      'Hola, {{patient_name}}.',
      '',
      'Te recordamos que mañana tienes una cita médica.',
      '',
      'Médico: {{doctor_name}}',
      'Fecha:  {{date}}',
      'Hora:   {{time}}',
      '',
      'Confirma tu cita aquí: {{confirm_url}}',
      '',
      'Si no podrás asistir, contacta a tu médico para cancelar o reprogramar.',
      '',
      'Delta Salud — Sistema de Gestión Médica',
    ].join('\n');

    // ---- reminder_1h -------------------------------------------------
    const html1h = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu consulta es en 1 hora</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { margin: 0; font-size: 13px; opacity: 0.88; }
    .body { padding: 32px; }
    .body p { line-height: 1.65; font-size: 15px; color: #334155; margin: 0 0 16px; }
    .info-box { background: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 6px; padding: 18px 22px; margin: 24px 0; }
    .info-box p { margin: 5px 0; font-size: 14px; color: #0f766e; }
    .info-box p strong { color: #0d9488; }
    .tip { font-size: 13px; color: #64748b; background: #f8fafc; border-radius: 6px; padding: 12px 16px; margin-top: 20px; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Salud</h1>
      <p>Recordatorio — tu consulta es pronto</p>
    </div>
    <div class="body">
      <p>Hola, <strong>{{patient_name}}</strong></p>
      <p>Le recordamos que su consulta m&eacute;dica es en aproximadamente <strong>1 hora</strong>. Por favor prep&aacute;rese con anticipaci&oacute;n.</p>
      <div class="info-box">
        <p><strong>M&eacute;dico:</strong> {{doctor_name}}</p>
        <p><strong>Fecha:</strong> {{date}}</p>
        <p><strong>Hora:</strong> {{time}}</p>
      </div>
      <p class="tip">Por favor llegue con <strong>10 minutos de anticipaci&oacute;n</strong> para completar su registro.</p>
    </div>
    <div class="footer">
      Delta Salud &mdash; Sistema de Gesti&oacute;n M&eacute;dica &nbsp;&bull;&nbsp; Este es un mensaje autom&aacute;tico, por favor no respondas a este correo.
    </div>
  </div>
</body>
</html>`;

    const text1h = [
      'Recordatorio de consulta — Delta Salud',
      '',
      'Hola, {{patient_name}}.',
      '',
      'Su consulta médica es en aproximadamente 1 hora.',
      '',
      'Médico: {{doctor_name}}',
      'Fecha:  {{date}}',
      'Hora:   {{time}}',
      '',
      'Por favor llegue con 10 minutos de anticipación.',
      '',
      'Delta Salud — Sistema de Gestión Médica',
    ].join('\n');

    await queryInterface.sequelize.query(
      `INSERT INTO email_templates
         (id, name, subject, html, text, description, is_active, created_at, updated_at)
       VALUES
         (gen_random_uuid(), :name24h, :subject24h, :html24h, :text24h, :desc24h, true, NOW(), NOW()),
         (gen_random_uuid(), :name1h,  :subject1h,  :html1h,  :text1h,  :desc1h,  true, NOW(), NOW())
       ON CONFLICT (name) DO UPDATE
         SET subject    = EXCLUDED.subject,
             html       = EXCLUDED.html,
             text       = EXCLUDED.text,
             description = EXCLUDED.description,
             updated_at = NOW()`,
      {
        replacements: {
          name24h: 'reminder_confirm_24h',
          subject24h: 'Recordatorio: tu cita es mañana — confírmala',
          html24h,
          text24h,
          desc24h:
            'Recordatorio automático 24h antes de la cita con botón de confirmación. ' +
            'Placeholders: patient_name, doctor_name, date, time, confirm_url.',

          name1h: 'reminder_1h',
          subject1h: 'Tu consulta es en 1 hora — {{time}}',
          html1h,
          text1h,
          desc1h:
            'Recordatorio automático 1h antes de la cita. ' +
            'Placeholders: patient_name, doctor_name, date, time.',
        },
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM email_templates WHERE name IN ('reminder_confirm_24h', 'reminder_1h')`,
    );

    await queryInterface.sequelize.query(
      `UPDATE reminders_settings SET reminder_1h_enabled = FALSE`,
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_settings
       ALTER COLUMN reminder_1h_enabled SET DEFAULT FALSE`,
    );

    await queryInterface.sequelize.query(
      `ALTER TABLE reminders_queue
       DROP CONSTRAINT IF EXISTS ux_reminders_queue_appt_offset`,
    );
  },
};
