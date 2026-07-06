'use strict';

/**
 * Migration: 20260706000000-appointment-confirmation-email-templates
 *
 * Seeds two appointment-confirmation email templates into `email_templates`.
 * Placeholders match exactly what appointment-notification.service.ts passes
 * at send time (all snake_case):
 *
 *   Both templates:
 *     {{patient_name}}, {{doctor_name}}, {{appointment_date}}, {{appointment_time}}
 *   Online only:
 *     {{meet_link}}
 *   In-person only:
 *     {{office_name}}, {{office_address}}
 *
 * Note: {{ics_content}} is intentionally NOT rendered in the body — it is raw
 * ICS text intended for attachment use only; the Resend adapter does not
 * support attachments yet.
 *
 * All inserts use ON CONFLICT (name) DO NOTHING so this migration is idempotent
 * and safe to run multiple times.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const onlineHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cita confirmada</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .badge { display: inline-block; background: #dcfce7; color: #15803d; border-radius: 6px; padding: 6px 14px; font-weight: 700; font-size: 14px; margin: 8px 0; }
    .info-box { background: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .info-box p { margin: 4px 0; font-size: 14px; color: #0f766e; }
    .meet-btn { display: inline-block; background: #0d9488; color: #fff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 700; font-size: 15px; margin: 20px 0; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Confirmación de cita &mdash; Videoconsulta</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{patient_name}}</strong>,</p>
      <p>Su cita ha sido <span class="badge">CONFIRMADA</span></p>
      <div class="info-box">
        <p><strong>Médico:</strong> {{doctor_name}}</p>
        <p><strong>Fecha:</strong> {{appointment_date}}</p>
        <p><strong>Hora:</strong> {{appointment_time}}</p>
      </div>
      <p>Su consulta se realizará por videollamada. Haga clic en el botón para unirse:</p>
      <p><a class="meet-btn" href="{{meet_link}}">Unirse a la videoconsulta</a></p>
      <p style="font-size:13px;color:#64748b;">
        O copie este enlace en su navegador:
        <a href="{{meet_link}}" style="color:#0d9488;">{{meet_link}}</a>
      </p>
      <p>Si necesita cancelar o reprogramar, comuníquese con el médico con anticipación.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    const inPersonHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cita confirmada</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .badge { display: inline-block; background: #dcfce7; color: #15803d; border-radius: 6px; padding: 6px 14px; font-weight: 700; font-size: 14px; margin: 8px 0; }
    .info-box { background: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .info-box p { margin: 4px 0; font-size: 14px; color: #0f766e; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Confirmación de cita &mdash; Presencial</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{patient_name}}</strong>,</p>
      <p>Su cita ha sido <span class="badge">CONFIRMADA</span></p>
      <div class="info-box">
        <p><strong>Médico:</strong> {{doctor_name}}</p>
        <p><strong>Fecha:</strong> {{appointment_date}}</p>
        <p><strong>Hora:</strong> {{appointment_time}}</p>
        <p><strong>Consultorio:</strong> {{office_name}}</p>
        <p><strong>Dirección:</strong> {{office_address}}</p>
      </div>
      <p>Le esperamos en la dirección indicada. Si necesita cancelar o reprogramar, comuníquese con el médico con anticipación.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    const templates = [
      {
        name: 'appointment_confirmation_online',
        subject: 'Cita confirmada con {{doctor_name}} — {{appointment_date}}',
        html: onlineHtml,
        text: null,
        description: 'Confirmación de cita online (videoconsulta) enviada al paciente',
      },
      {
        name: 'appointment_confirmation_inperson',
        subject: 'Cita confirmada con {{doctor_name}} — {{appointment_date}}',
        html: inPersonHtml,
        text: null,
        description: 'Confirmación de cita presencial enviada al paciente',
      },
    ];

    for (const tpl of templates) {
      await queryInterface.sequelize.query(
        `INSERT INTO email_templates (id, name, subject, html, text, description, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), :name, :subject, :html, :text, :description, true, NOW(), NOW())
         ON CONFLICT (name) DO NOTHING`,
        {
          replacements: {
            name: tpl.name,
            subject: tpl.subject,
            html: tpl.html,
            text: tpl.text,
            description: tpl.description,
          },
        },
      );
    }
  },

  async down(queryInterface) {
    const names = ['appointment_confirmation_online', 'appointment_confirmation_inperson'];

    await queryInterface.sequelize.query(
      `DELETE FROM email_templates WHERE name IN (${names.map((_, i) => `:name${i}`).join(', ')})`,
      {
        replacements: Object.fromEntries(names.map((n, i) => [`name${i}`, n])),
      },
    );
  },
};
