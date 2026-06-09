'use strict';

/**
 * Migration: 20260608000002-email-templates-seed
 *
 * Seeds additional email templates into `email_templates`.
 * All inserts use ON CONFLICT (name) DO NOTHING so this migration is idempotent
 * and safe to run multiple times.
 *
 * Templates added:
 *   - reminder_24h       Appointment reminder — 24 hours before
 *   - reminder_3h        Appointment reminder — 3 hours before
 *   - reminder_7d        Appointment reminder — 7 days before
 *   - payment_approved   Subscription payment approved
 *   - welcome            Welcome email for new doctors
 *   - appointment_confirmed  Appointment confirmed for patient
 *
 * Placeholders use {{key}} syntax resolved by MailerService at send time.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const reminderHtml = (offset) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recordatorio de cita</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .info-box { background: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .info-box p { margin: 4px 0; font-size: 14px; color: #0f766e; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Recordatorio de cita — ${offset}</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{patientName}}</strong>,</p>
      <p>Le recordamos que tiene una cita médica programada <strong>${offset}</strong>.</p>
      <div class="info-box">
        <p><strong>Médico:</strong> {{doctorName}}</p>
        <p><strong>Fecha:</strong> {{date}}</p>
        <p><strong>Hora:</strong> {{time}}</p>
      </div>
      <p>Si necesita cancelar o reprogramar su cita, comuníquese con su médico lo antes posible.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    const templates = [
      {
        name: 'reminder_24h',
        subject: 'Recordatorio: su cita es mañana — {{date}}',
        html: reminderHtml('en 24 horas'),
        text: null,
        description: 'Recordatorio de cita 24 horas antes',
      },
      {
        name: 'reminder_3h',
        subject: 'Recordatorio: su cita es en 3 horas — {{time}}',
        html: reminderHtml('en 3 horas'),
        text: null,
        description: 'Recordatorio de cita 3 horas antes',
      },
      {
        name: 'reminder_7d',
        subject: 'Recordatorio: su cita es en 7 días — {{date}}',
        html: reminderHtml('en 7 días'),
        text: null,
        description: 'Recordatorio de cita 7 días antes',
      },
      {
        name: 'payment_approved',
        subject: 'Pago aprobado — Delta Medical CRM',
        html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pago aprobado</title>
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
      <p>Confirmación de pago</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{doctorName}}</strong>,</p>
      <p>Su pago de suscripción ha sido <span class="badge">APROBADO</span></p>
      <div class="info-box">
        <p><strong>Monto:</strong> {{amount}}</p>
        <p><strong>Fecha de aprobación:</strong> {{date}}</p>
      </div>
      <p>Su suscripción ha sido extendida. Gracias por su confianza en Delta Medical.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`,
        text: null,
        description: 'Pago de suscripción aprobado — notificación al médico',
      },
      {
        name: 'welcome',
        subject: 'Bienvenido/a a Delta Medical CRM, {{doctorName}}',
        html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido a Delta Medical</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .features { list-style: none; padding: 0; margin: 20px 0; }
    .features li { padding: 8px 0; padding-left: 24px; position: relative; font-size: 14px; color: #334155; }
    .features li::before { content: "✓"; position: absolute; left: 0; color: #0d9488; font-weight: 700; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>¡Bienvenido a la plataforma!</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{doctorName}}</strong>,</p>
      <p>Le damos la bienvenida a <strong>Delta Medical CRM</strong>, la plataforma de gestión clínica diseñada para médicos especialistas en Venezuela.</p>
      <p>Con Delta Medical podrá:</p>
      <ul class="features">
        <li>Gestionar su agenda y citas en línea</li>
        <li>Mantener el historial clínico de sus pacientes</li>
        <li>Emitir recetas y documentos médicos</li>
        <li>Controlar sus finanzas y pagos</li>
      </ul>
      <p>Si tiene alguna pregunta, nuestro equipo de soporte está disponible para ayudarle.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`,
        text: null,
        description: 'Bienvenida al médico al registrarse en la plataforma',
      },
      {
        name: 'appointment_confirmed',
        subject: 'Cita confirmada con {{doctorName}} — {{date}}',
        html: `<!DOCTYPE html>
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
      <p>Confirmación de cita</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{patientName}}</strong>,</p>
      <p>Su cita ha sido <span class="badge">CONFIRMADA</span></p>
      <div class="info-box">
        <p><strong>Médico:</strong> {{doctorName}}</p>
        <p><strong>Fecha:</strong> {{date}}</p>
        <p><strong>Hora:</strong> {{time}}</p>
      </div>
      <p>Si necesita cancelar o reprogramar, comuníquese con el consultorio con anticipación.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`,
        text: null,
        description: 'Confirmación de cita enviada al paciente',
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
    const names = [
      'reminder_24h',
      'reminder_3h',
      'reminder_7d',
      'payment_approved',
      'welcome',
      'appointment_confirmed',
    ];

    await queryInterface.sequelize.query(
      `DELETE FROM email_templates WHERE name IN (${names.map((_, i) => `:name${i}`).join(', ')})`,
      {
        replacements: Object.fromEntries(names.map((n, i) => [`name${i}`, n])),
      },
    );
  },
};
