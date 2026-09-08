'use strict';

/**
 * Migration: 20260908000005-quotes-expiry-reminder
 *
 * Three parts, all additive:
 *
 *   1. `quotes.expiry_reminder_sent_at` — nullable timestamp, stamped once the
 *      "about to expire" notice has been dispatched (or attempted) for a
 *      quote, so DispatchQuoteExpiryNoticesUseCase never retries the same
 *      quote forever.
 *   2. Partial index on the exact query shape the cron uses every 15 minutes:
 *      status = 'sent' AND valid_until IS NOT NULL. (Sin el sello del aviso —
 *      ver el comentario largo junto al CREATE INDEX.)
 *   3. Two new `email_templates` rows: `quote_expiring_recipient` (to the
 *      patient/lead, with the public link) and `quote_expiring_doctor` (to
 *      the specialist, no link — just a nudge that a quote they sent is
 *      about to expire unanswered).
 *
 * NOTE: this migration receives only DATABASE_URL and NODE_ENV — no
 * ENCRYPTION_KEY. Nothing here decrypts any column.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and the
 * template INSERTs use ON CONFLICT (name) DO NOTHING.
 *
 * @type {import('sequelize-cli').Migration}
 */

// ── Part 3: quote_expiring_recipient ─────────────────────────────────────────
// Placeholders: {{recipientName}}, {{doctorName}}, {{quoteNumber}}, {{validUntil}}, {{quoteUrl}}
const QUOTE_EXPIRING_RECIPIENT_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Su presupuesto está por vencer</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .badge { display: inline-block; background: #fef3c7; color: #b45309; border-radius: 6px; padding: 6px 14px; font-weight: 700; font-size: 14px; margin: 8px 0; }
    .info-box { background: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .info-box p { margin: 4px 0; font-size: 14px; color: #0f766e; }
    .cta { display: inline-block; background: #0d9488; color: #fff !important; text-decoration: none; font-weight: 700; padding: 12px 28px; border-radius: 8px; margin: 12px 0; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Su presupuesto está por vencer</p>
    </div>
    <div class="body">
      <p>Hola <strong>{{recipientName}}</strong>,</p>
      <p><span class="badge">POR VENCER</span></p>
      <p><strong>{{doctorName}}</strong> le envió un presupuesto que está a punto de vencer. Si todavía le interesa, respóndalo antes de esa fecha.</p>
      <div class="info-box">
        <p><strong>Presupuesto:</strong> {{quoteNumber}}</p>
        <p><strong>Válido hasta:</strong> {{validUntil}}</p>
      </div>
      <p style="text-align:center">
        <a href="{{quoteUrl}}" class="cta">Ver presupuesto y responder</a>
      </p>
      <p>Si ya respondió, puede ignorar este mensaje.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

// ── Part 3: quote_expiring_doctor ────────────────────────────────────────────
// Placeholders: {{doctorName}}, {{quoteNumber}}, {{recipientName}}, {{validUntil}}, {{totalUsd}}
const QUOTE_EXPIRING_DOCTOR_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Un presupuesto suyo está por vencer</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .badge { display: inline-block; background: #fef3c7; color: #b45309; border-radius: 6px; padding: 6px 14px; font-weight: 700; font-size: 14px; margin: 8px 0; }
    .info-box { background: #f0fdfa; border-left: 4px solid #0d9488; border-radius: 4px; padding: 16px 20px; margin: 20px 0; }
    .info-box p { margin: 4px 0; font-size: 14px; color: #0f766e; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Un presupuesto suyo está por vencer</p>
    </div>
    <div class="body">
      <p>Hola <strong>{{doctorName}}</strong>,</p>
      <p><span class="badge">POR VENCER</span></p>
      <p>El presupuesto que le envió a <strong>{{recipientName}}</strong> está a punto de vencer y todavía no lo ha respondido.</p>
      <div class="info-box">
        <p><strong>Presupuesto:</strong> {{quoteNumber}}</p>
        <p><strong>Válido hasta:</strong> {{validUntil}}</p>
        <p><strong>Total:</strong> USD {{totalUsd}}</p>
      </div>
      <p>Si le interesa que no se venza, puede contactar a la persona directamente o esperar su respuesta antes de esa fecha.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

const NEW_TEMPLATES = [
  {
    name: 'quote_expiring_recipient',
    subject: 'Su presupuesto {{quoteNumber}} está por vencer',
    html: QUOTE_EXPIRING_RECIPIENT_HTML,
    text: null,
    description: 'Aviso al destinatario: el presupuesto enviado está por vencer',
  },
  {
    name: 'quote_expiring_doctor',
    subject: 'Presupuesto {{quoteNumber}} por vencer sin respuesta',
    html: QUOTE_EXPIRING_DOCTOR_HTML,
    text: null,
    description: 'Aviso al especialista: un presupuesto suyo está por vencer sin respuesta',
  },
];

module.exports = {
  async up(queryInterface) {
    const q = queryInterface.sequelize;

    // ── Part 1: quotes.expiry_reminder_sent_at ───────────────────────────────
    await q.query(`
      ALTER TABLE quotes
        ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at TIMESTAMPTZ NULL
    `);

    // ── Part 2: partial index matching the cron's exact WHERE clause ────────
    //
    // El predicado NO incluye `expiry_reminder_sent_at IS NULL`, aunque sea la
    // columna que agrega esta misma migración. Postgres solo puede usar un
    // índice parcial si el WHERE de la consulta implica el del índice, y la
    // consulta del cron (findQuotesNearingExpiry) deliberadamente NO filtra por
    // ese campo: un presupuesto que YA recibió su aviso igual tiene que poder
    // vencer cuando le llegue la fecha. Filtrarlo dejaría a esos presupuestos
    // colgados en 'sent' para siempre.
    //
    // Con el sello adentro, el índice quedaba inutilizable justo para la única
    // consulta que lo motivó.
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_expiry_reminder_pending
        ON quotes (valid_until)
        WHERE status = 'sent'
          AND valid_until IS NOT NULL
    `);

    // ── Part 3: seed the two templates ───────────────────────────────────────
    for (const tpl of NEW_TEMPLATES) {
      await q.query(
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
    const q = queryInterface.sequelize;

    // Reverse order

    // Part 3
    const names = NEW_TEMPLATES.map((t) => t.name);
    await q.query(
      `DELETE FROM email_templates WHERE name IN (${names.map((_, i) => `:name${i}`).join(', ')})`,
      { replacements: Object.fromEntries(names.map((n, i) => [`name${i}`, n])) },
    );

    // Part 2
    await q.query(`DROP INDEX IF EXISTS idx_quotes_expiry_reminder_pending`);

    // Part 1
    await q.query(`ALTER TABLE quotes DROP COLUMN IF EXISTS expiry_reminder_sent_at`);
  },
};
