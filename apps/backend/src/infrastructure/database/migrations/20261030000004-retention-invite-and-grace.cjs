'use strict';

/**
 * Migration: 20261030000004-retention-invite-and-grace
 *
 * Phase 4 of the specialist-retention plan — invitation email + grace month.
 *
 * CREATES:
 *   - Index on doctor_prompts for efficient email-invite candidate lookup.
 *   - Index on email_send_log for efficient one-per-day lifecycle email check.
 *
 * SEEDS (ON CONFLICT DO NOTHING — never overwrites admin edits):
 *   - `email_templates`: retention_meeting_invite
 *
 * NOTES:
 *   - subscription_changes_log.action is TEXT (no enum), so adding 'grace_month'
 *     does NOT require ALTER TYPE — no transaction-breaking ADD VALUE needed.
 *   - The `q` helper always forwards `opts` (opts = {}) for consistency.
 *   - No ADD CONSTRAINT IF NOT EXISTS (Postgres does not support it).
 *
 * @type {import('sequelize-cli').Migration}
 */

// ---------------------------------------------------------------------------
// Email template body
// ---------------------------------------------------------------------------

const INVITE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Queremos conocerte — Delta Salud</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.7; font-size: 15px; color: #334155; margin: 0 0 16px 0; }
    .trial-badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
    .highlight { background: #f0fdfa; border-left: 3px solid #0d9488; padding: 14px 18px; border-radius: 0 6px 6px 0; margin: 20px 0; color: #0f5c55; font-size: 15px; line-height: 1.6; }
    .cta-wrap { text-align: center; margin: 28px 0 8px; }
    .cta { display: inline-block; background: #0d9488; color: #fff !important; padding: 14px 36px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 16px; letter-spacing: 0.2px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{doctorName}}, queremos conocerte</h1>
    </div>
    <div class="body">
      <span class="trial-badge">Tu prueba {{trialStatus}}</span>
      <p>Hola {{doctorName}},</p>
      <p>Estamos construyendo Delta Salud junto a especialistas como tú. Nos encantaría conocerte y escuchar tu experiencia: qué te ha servido, qué no, y qué le falta a Delta para tu consulta.</p>
      <div class="highlight">
        <strong>Tu opinión decide lo que construimos.</strong><br />
        Te pedimos 30 minutos por videollamada.
      </div>
      <p>Como agradecimiento por tu tiempo, <strong>te regalamos un mes más de Delta</strong>.</p>
      <p>Inicia sesión y elige el horario que te quede mejor desde tu panel:</p>
      <div class="cta-wrap">
        <a href="{{loginUrl}}" class="cta">Iniciar sesión en Delta</a>
      </div>
    </div>
    <div class="footer">
      <p>Este correo fue generado automáticamente por Delta Salud. Si no esperabas este mensaje, puedes ignorarlo.</p>
    </div>
  </div>
</body>
</html>`;

const INVITE_TEXT = `{{doctorName}}, queremos conocerte

Hola {{doctorName}},

Tu prueba {{trialStatus}}.

Estamos construyendo Delta Salud junto a especialistas como tú. Nos encantaría conocerte y escuchar tu experiencia: qué te ha servido, qué no, y qué le falta a Delta para tu consulta. Tu opinión decide lo que construimos.

Te pedimos 30 minutos por videollamada. Como agradecimiento, te regalamos un mes más de Delta.

Inicia sesión y elige el horario que te quede mejor:
{{loginUrl}}

El equipo de Delta Salud`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) =>
        queryInterface.sequelize.query(sql, { transaction, ...opts });

      // ------------------------------------------------------------------
      // 1. Index for efficient lifecycle email check per doctor per day
      //    (email_send_log: look up by recipient_id + created_at date)
      // ------------------------------------------------------------------
      await q(`
        CREATE INDEX IF NOT EXISTS email_send_log_recipient_created_idx
          ON email_send_log (recipient_id, created_at DESC)
         WHERE recipient_id IS NOT NULL
      `);

      // ------------------------------------------------------------------
      // 2. Index on doctor_prompts for invite-candidate exclusion check
      // ------------------------------------------------------------------
      await q(`
        CREATE INDEX IF NOT EXISTS doctor_prompts_key_idx
          ON doctor_prompts (doctor_id, prompt_key)
      `);

      // ------------------------------------------------------------------
      // 3. Partial UNIQUE index: at most one grace_month row per doctor.
      //    This prevents the grace-month race condition: two concurrent
      //    admin requests both pass the hasGraceMonth() check (false) but
      //    only the first INSERT into subscription_changes_log succeeds;
      //    the second gets PG error 23505, which the repo maps to
      //    GraceMonthAlreadyGrantedError (409) — no double extension.
      //
      //    action is TEXT (no Postgres enum), so no ALTER TYPE needed.
      //    No existing rows have action='grace_month' (first migration for it).
      // ------------------------------------------------------------------
      await q(`
        CREATE UNIQUE INDEX IF NOT EXISTS grace_month_one_per_doctor_idx
          ON subscription_changes_log (doctor_id)
         WHERE action = 'grace_month'
      `);

      // ------------------------------------------------------------------
      // 3. Seed retention_meeting_invite email template
      // ------------------------------------------------------------------
      const now = new Date();

      await q(
        `INSERT INTO email_templates
           (id, name, subject, html, text, description, is_active, created_at, updated_at)
         VALUES
           (gen_random_uuid(),
            'retention_meeting_invite',
            '{{doctorName}}, queremos conocerte',
            :html, :text,
            'Invitation to schedule a 30-min feedback meeting sent to free-trial specialists (pre and expired windows). Variables: doctorName, trialStatus, loginUrl.',
            true, :now, :now)
         ON CONFLICT (name) DO NOTHING`,
        { replacements: { html: INVITE_HTML, text: INVITE_TEXT, now } },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) =>
        queryInterface.sequelize.query(sql, { transaction, ...opts });

      await q(`
        DELETE FROM email_templates WHERE name = 'retention_meeting_invite'
      `);

      await q(`DROP INDEX IF EXISTS grace_month_one_per_doctor_idx`);
      await q(`DROP INDEX IF EXISTS doctor_prompts_key_idx`);
      await q(`DROP INDEX IF EXISTS email_send_log_recipient_created_idx`);
    });
  },
};
