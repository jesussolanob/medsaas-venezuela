'use strict';

/**
 * Migration: 20260723000003-pending-consultation-reminder-template
 *
 * Inserts the `pending_consultation_reminder` email template used by
 * DispatchPendingConsultationRemindersUseCase to remind patients to schedule
 * their pending (pre-paid) consultation sessions.
 *
 * Template variables:
 *   {{patientName}}   — Patient's full name
 *   {{doctorName}}    — Doctor's full name
 *   {{planName}}      — Name of the purchased service plan
 *   {{sessionNumber}} — Number of the pending session (e.g. "2", "3")
 *   {{expiresAtLabel}}— Self-contained phrase built in the use-case:
 *                       "Válido hasta el <fecha es-VE>" when expires_at is set,
 *                       empty string "" when there is no expiry.
 *                       Used as-is; no conditional logic in the template.
 *   {{scheduleUrl}}   — Full URL to the public scheduling page for this session
 *
 * NOTE: MailerService.render() uses simple {{key}} substitution only — no
 * Handlebars/Mustache conditionals. All conditional logic lives in the use-case.
 *
 * Idempotent: ON CONFLICT (name) DO NOTHING — re-running is safe.
 *
 * @type {import('sequelize-cli').Migration}
 */

const SUBJECT =
  'Tienes una consulta pendiente por agendar — {{planName}}';

const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Consulta pendiente por agendar</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #111827;
    }
    .wrapper {
      max-width: 600px;
      margin: 32px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,.08);
    }
    .header {
      background: #0d9488;
      padding: 28px 32px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .header p {
      margin: 6px 0 0;
      color: rgba(255,255,255,.8);
      font-size: 13px;
    }
    .body {
      padding: 32px 32px 24px;
    }
    .greeting {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 12px;
      color: #111827;
    }
    .body p {
      font-size: 14px;
      line-height: 1.6;
      color: #374151;
      margin: 0 0 16px;
    }
    .info-box {
      background: #f0fdfa;
      border: 1px solid #99f6e4;
      border-radius: 6px;
      padding: 16px 20px;
      margin: 20px 0;
    }
    .info-box table {
      width: 100%;
      border-collapse: collapse;
    }
    .info-box td {
      font-size: 13px;
      padding: 4px 0;
      color: #374151;
    }
    .info-box td:first-child {
      color: #6b7280;
      width: 48%;
    }
    .info-box td:last-child {
      font-weight: 600;
      color: #111827;
    }
    .cta {
      text-align: center;
      margin: 28px 0 20px;
    }
    .cta a {
      display: inline-block;
      background: #0d9488;
      color: #ffffff;
      text-decoration: none;
      font-size: 15px;
      font-weight: 600;
      padding: 14px 32px;
      border-radius: 6px;
      letter-spacing: 0.01em;
    }
    .validity {
      font-size: 13px;
      color: #d97706;
      text-align: center;
      margin: 0 0 20px;
    }
    .note {
      font-size: 12px;
      color: #9ca3af;
      text-align: center;
      margin: 0 0 8px;
    }
    .footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 20px 32px;
      text-align: center;
    }
    .footer p {
      font-size: 12px;
      color: #9ca3af;
      margin: 0;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Delta Salud</h1>
      <p>Consultas por agendar</p>
    </div>

    <div class="body">
      <p class="greeting">Hola, {{patientName}}</p>

      <p>
        Tienes una consulta pendiente por agendar con
        <strong>{{doctorName}}</strong>.
        Esta consulta forma parte de tu plan <strong>{{planName}}</strong>
        y ya se encuentra pagada — solo necesitas elegir la fecha y hora.
      </p>

      <div class="info-box">
        <table>
          <tr>
            <td>Plan:</td>
            <td>{{planName}}</td>
          </tr>
          <tr>
            <td>Sesi&oacute;n:</td>
            <td>No. {{sessionNumber}}</td>
          </tr>
          <tr>
            <td>Especialista:</td>
            <td>{{doctorName}}</td>
          </tr>
        </table>
      </div>

      <div class="cta">
        <a href="{{scheduleUrl}}">Agendar mi consulta</a>
      </div>

      <p class="validity">{{expiresAtLabel}}</p>

      <p class="note">
        Si ya agendaste esta consulta, puedes ignorar este mensaje.
      </p>
    </div>

    <div class="footer">
      <p>
        Delta Salud &mdash; Gesti&oacute;n m&eacute;dica digital<br />
        Este es un mensaje autom&aacute;tico. Por favor no respondas a este correo.
      </p>
    </div>
  </div>
</body>
</html>`;

const TEXT = `Hola {{patientName}},

Tienes una consulta pendiente por agendar con {{doctorName}}.

Plan: {{planName}}
Sesión: No. {{sessionNumber}}
Especialista: {{doctorName}}

Esta consulta ya se encuentra pagada. Solo necesitas elegir la fecha y hora.

Agendar mi consulta: {{scheduleUrl}}

{{expiresAtLabel}}

Si ya agendaste esta consulta, puedes ignorar este mensaje.

Delta Salud — Gestión médica digital
Este es un mensaje automático. Por favor no respondas a este correo.`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `INSERT INTO email_templates (id, name, subject, html, text, created_at, updated_at)
       VALUES (gen_random_uuid(), :name, :subject, :html, :text, NOW(), NOW())
       ON CONFLICT (name) DO NOTHING`,
      {
        replacements: {
          name: 'pending_consultation_reminder',
          subject: SUBJECT,
          html: HTML,
          text: TEXT,
        },
      },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM email_templates WHERE name = 'pending_consultation_reminder'`,
    );
  },
};
