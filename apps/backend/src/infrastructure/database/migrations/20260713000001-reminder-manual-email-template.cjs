'use strict';

/**
 * Migration: 20260713000001-reminder-manual-email-template
 *
 * Seeds the `reminder_manual` email template used by the
 * POST /api/doctor/reminders/send-email endpoint.
 *
 * Branded for Delta Salud with emojis and clear appointment data.
 * Placeholders: {{patient_name}}, {{doctor_name}}, {{date}}, {{time}},
 *               {{service}}, {{code}}
 *
 * Idempotent: ON CONFLICT (name) DO NOTHING — safe to re-run.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recordatorio de consulta</title>
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
    .code-box { background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 14px 18px; margin: 20px 0; text-align: center; }
    .code-box p { margin: 0; font-size: 13px; color: #713f12; }
    .code-box span { display: block; font-size: 22px; font-weight: 700; letter-spacing: 4px; color: #92400e; margin-top: 4px; }
    .tip { font-size: 13px; color: #64748b; background: #f8fafc; border-radius: 6px; padding: 12px 16px; margin-top: 20px; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>&#x1F4C5; Delta Salud</h1>
      <p>Recordatorio de tu consulta m&eacute;dica</p>
    </div>
    <div class="body">
      <p>Hola, <strong>{{patient_name}}</strong> &#x1F44B;</p>
      <p>Tu m&eacute;dico te env&iacute;a este recordatorio para tu pr&oacute;xima consulta. ¡Te esperamos!</p>
      <div class="info-box">
        <p>&#x1F468;&#x200D;&#x2695;&#xFE0F; <strong>M&eacute;dico:</strong> {{doctor_name}}</p>
        <p>&#x1F4C5; <strong>Fecha:</strong> {{date}}</p>
        <p>&#x1F55B; <strong>Hora:</strong> {{time}}</p>
        <p>&#x1F3E5; <strong>Servicio:</strong> {{service}}</p>
      </div>
      <div class="code-box">
        <p>&#x1F4CB; Tu c&oacute;digo de cita</p>
        <span>{{code}}</span>
      </div>
      <p class="tip">&#x23F0; Por favor llega con <strong>10 minutos de anticipaci&oacute;n</strong> para completar tu registro.</p>
      <p>Si necesitas cancelar o reprogramar, contacta a tu m&eacute;dico lo antes posible.</p>
    </div>
    <div class="footer">
      Delta Salud &mdash; Sistema de Gesti&oacute;n M&eacute;dica &nbsp;&bull;&nbsp; Este es un mensaje autom&aacute;tico, por favor no respondas a este correo.
    </div>
  </div>
</body>
</html>`;

    const text = [
      'Recordatorio de consulta — Delta Salud',
      '',
      'Hola, {{patient_name}}.',
      '',
      'Tu médico te envía este recordatorio para tu próxima consulta.',
      '',
      'Médico:   {{doctor_name}}',
      'Fecha:    {{date}}',
      'Hora:     {{time}}',
      'Servicio: {{service}}',
      'Código:   {{code}}',
      '',
      'Por favor llega con 10 minutos de anticipación.',
      '',
      'Delta Salud — Sistema de Gestión Médica',
    ].join('\n');

    await queryInterface.sequelize.query(
      `INSERT INTO email_templates
         (id, name, subject, html, text, description, is_active, created_at, updated_at)
       VALUES
         (gen_random_uuid(), :name, :subject, :html, :text, :description, true, NOW(), NOW())
       ON CONFLICT (name) DO NOTHING`,
      {
        replacements: {
          name: 'reminder_manual',
          subject: '📅 Recordatorio de tu consulta - {{date}}',
          html,
          text,
          description:
            'Recordatorio manual de cita enviado por el médico desde la agenda. ' +
            'Placeholders: patient_name, doctor_name, date, time, service, code.',
        },
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM email_templates WHERE name = 'reminder_manual'`,
    );
  },
};
