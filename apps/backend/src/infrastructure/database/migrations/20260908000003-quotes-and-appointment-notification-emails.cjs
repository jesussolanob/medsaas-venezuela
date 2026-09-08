'use strict';

/**
 * Migration: 20260908000003-quotes-and-appointment-notification-emails
 *
 * Three parts, all additive to `email_templates`:
 *
 *   1. `quote_sent`            — surgical phrase REPLACE (not a full rewrite —
 *      the template is editable from /admin/email-templates and a full UPDATE
 *      would wipe any customisation the owner made). Makes the invitation to
 *      accept/reject explicit; today it only said "ver presupuesto completo".
 *   2. `quote_accepted_doctor` — NEW template. Notifies the specialist when the
 *      recipient accepts a quote from the public link.
 *   3. `appointment_new_doctor` — NEW template. Notifies the specialist of a
 *      new appointment (public booking or their own alta) — today only the
 *      patient gets a confirmation email; the doctor only finds out via
 *      Google Calendar, and only if they connected it.
 *
 * Idempotent: REPLACE() on Part 1 is a no-op once already applied (the "from"
 * phrase is gone), and both INSERTs use ON CONFLICT (name) DO NOTHING.
 *
 * @type {import('sequelize-cli').Migration}
 */

// ── Part 1: quote_sent — targeted phrase replacement ────────────────────────
const QUOTE_SENT = 'quote_sent';
const QUOTE_SENT_PHRASES = [
  [
    'le ha enviado un presupuesto para los servicios solicitados.',
    'le ha enviado un presupuesto para los servicios solicitados. Desde el enlace podrá revisarlo y aceptarlo o rechazarlo.',
  ],
  ['Ver presupuesto completo', 'Ver presupuesto y responder'],
];

async function replacePhrases(queryInterface, templateName, pairs) {
  for (const [from, to] of pairs) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET subject    = REPLACE(subject, :from, :to),
              html       = REPLACE(html, :from, :to),
              -- Preserve NULL: COALESCE would turn it into an empty string,
              -- which is a data change nobody asked for.
              text       = CASE WHEN text IS NULL THEN NULL
                                ELSE REPLACE(text, :from, :to) END,
              updated_at = NOW()
        WHERE name = :templateName`,
      { replacements: { from, to, templateName } },
    );
  }
}

// ── Part 2: quote_accepted_doctor — NEW template ─────────────────────────────
// Placeholders: {{doctorName}}, {{quoteNumber}}, {{recipientName}}, {{totalUsd}}
const QUOTE_ACCEPTED_DOCTOR_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Presupuesto aceptado</title>
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
      <p>Presupuesto aceptado</p>
    </div>
    <div class="body">
      <p>Hola <strong>{{doctorName}}</strong>,</p>
      <p><span class="badge">ACEPTADO</span></p>
      <p><strong>{{recipientName}}</strong> aceptó el presupuesto que le envió.</p>
      <div class="info-box">
        <p><strong>Presupuesto:</strong> {{quoteNumber}}</p>
        <p><strong>Total:</strong> USD {{totalUsd}}</p>
      </div>
      <p>Comuníquese con la persona para coordinar el pago y, si corresponde, compartirle su enlace de reserva de cita.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

// ── Part 3: appointment_new_doctor — NEW template ────────────────────────────
// Placeholders: {{doctor_name}}, {{patient_name}}, {{appointment_date}},
//               {{appointment_time}}, {{appointment_mode}}, {{office_name}},
//               {{office_address}}
const APPOINTMENT_NEW_DOCTOR_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nueva cita agendada</title>
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
      <p>Nueva cita agendada</p>
    </div>
    <div class="body">
      <p>Hola <strong>{{doctor_name}}</strong>,</p>
      <p>Tiene una nueva cita <span class="badge">{{appointment_mode}}</span></p>
      <div class="info-box">
        <p><strong>Paciente:</strong> {{patient_name}}</p>
        <p><strong>Fecha:</strong> {{appointment_date}}</p>
        <p><strong>Hora:</strong> {{appointment_time}}</p>
        <p><strong>Consultorio:</strong> {{office_name}}</p>
        <p><strong>Dirección:</strong> {{office_address}}</p>
      </div>
      <p>Revise su agenda en Delta Salud para más detalles.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

const NEW_TEMPLATES = [
  {
    name: 'quote_accepted_doctor',
    subject: 'Presupuesto {{quoteNumber}} aceptado',
    html: QUOTE_ACCEPTED_DOCTOR_HTML,
    text: null,
    description: 'Aviso al especialista: el destinatario aceptó su presupuesto',
  },
  {
    name: 'appointment_new_doctor',
    subject: 'Nueva cita — {{appointment_date}} {{appointment_time}}',
    html: APPOINTMENT_NEW_DOCTOR_HTML,
    text: null,
    description: 'Aviso al especialista de una cita nueva (booking público o alta propia)',
  },
];

module.exports = {
  async up(queryInterface) {
    // Part 1
    await replacePhrases(queryInterface, QUOTE_SENT, QUOTE_SENT_PHRASES);

    // Parts 2 + 3
    for (const tpl of NEW_TEMPLATES) {
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
    // Reverse order

    // Parts 2 + 3
    const names = NEW_TEMPLATES.map((t) => t.name);
    await queryInterface.sequelize.query(
      `DELETE FROM email_templates WHERE name IN (${names.map((_, i) => `:name${i}`).join(', ')})`,
      { replacements: Object.fromEntries(names.map((n, i) => [`name${i}`, n])) },
    );

    // Part 1
    await replacePhrases(
      queryInterface,
      QUOTE_SENT,
      QUOTE_SENT_PHRASES.map(([from, to]) => [to, from]),
    );
  },
};
