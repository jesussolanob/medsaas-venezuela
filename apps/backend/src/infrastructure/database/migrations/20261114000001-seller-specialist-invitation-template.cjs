'use strict';

/**
 * Migration: 20261114000001-seller-specialist-invitation-template
 *
 * Seeds the `specialist_invitation` email template sent to specialists when a
 * seller pre-registers them via POST /api/seller/specialist-invitations.
 *
 * SEEDS (ON CONFLICT DO NOTHING — never overwrites admin edits):
 *   - `email_templates`: specialist_invitation
 *
 * Variables: specialistName, loginUrl.
 *
 * @type {import('sequelize-cli').Migration}
 */

// ---------------------------------------------------------------------------
// Email template body
// ---------------------------------------------------------------------------

const INVITATION_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Te invitaron a Delta Salud</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.7; font-size: 15px; color: #334155; margin: 0 0 16px 0; }
    .highlight { background: #f0fdfa; border-left: 3px solid #0d9488; padding: 14px 18px; border-radius: 0 6px 6px 0; margin: 20px 0; color: #0f5c55; font-size: 15px; line-height: 1.6; }
    .steps { margin: 20px 0; }
    .step { display: flex; gap: 12px; margin-bottom: 14px; align-items: flex-start; }
    .step-num { background: #0d9488; color: #fff; border-radius: 50%; width: 24px; height: 24px; min-width: 24px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
    .step-text { font-size: 14px; color: #334155; line-height: 1.6; padding-top: 2px; }
    .cta-wrap { text-align: center; margin: 28px 0 8px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Hola {{specialistName}}, te invitaron a Delta Salud</h1>
    </div>
    <div class="body">
      <p>Hola <strong>{{specialistName}}</strong>,</p>
      <p>Un representante de Delta Salud ya creó tu perfil de especialista en la plataforma. Solo tienes que ingresar para completar tu consultorio y empezar a recibir pacientes.</p>

      <div class="highlight">
        Tu cuenta ya está lista. El proceso de alta es rápido: consultorio, servicio y listo.
      </div>

      <p><strong>¿Cómo entrar?</strong></p>
      <div class="steps">
        <div class="step">
          <span class="step-num">1</span>
          <span class="step-text">Entra a <strong>{{loginUrl}}</strong></span>
        </div>
        <div class="step">
          <span class="step-num">2</span>
          <span class="step-text">Inicia sesión con este mismo correo electrónico.</span>
        </div>
        <div class="step">
          <span class="step-num">3</span>
          <span class="step-text">Si usas Gmail, puedes usar <strong>"Continuar con Google"</strong>. Si no, crea tu contraseña con este correo.</span>
        </div>
        <div class="step">
          <span class="step-num">4</span>
          <span class="step-text">El sistema te lleva directamente al asistente de alta para configurar tu consultorio.</span>
        </div>
      </div>

      <div class="cta-wrap">
        <a href="{{loginUrl}}" style="display:inline-block;background:#0d9488;color:#ffffff;padding:14px 36px;border-radius:6px;text-decoration:none;font-weight:700;font-size:16px;">Completar mi perfil</a>
      </div>
    </div>
    <div class="footer">
      <p>Este correo fue generado automáticamente por Delta Salud. Si no esperabas este mensaje, puedes ignorarlo.</p>
    </div>
  </div>
</body>
</html>`;

const INVITATION_TEXT = `Hola {{specialistName}},

Un representante de Delta Salud ya creó tu perfil de especialista en la plataforma.
Solo tienes que ingresar para completar tu consultorio y empezar a recibir pacientes.

CÓMO ENTRAR
1. Entra a {{loginUrl}}
2. Inicia sesión con este mismo correo electrónico.
3. Si usas Gmail, usa "Continuar con Google". Si no, crea tu contraseña con este correo.
4. El sistema te lleva a completar tu consultorio (consultorio + servicio = listo).

El equipo de Delta Salud`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) => queryInterface.sequelize.query(sql, { transaction, ...opts });

      const now = new Date();

      await q(
        `INSERT INTO email_templates
           (id, name, subject, html, text, description, is_active, created_at, updated_at)
         VALUES
           (gen_random_uuid(),
            'specialist_invitation',
            'Te invitaron a Delta Salud — completa tu perfil',
            :html, :text,
            'Invitation email sent to specialists when a seller pre-registers them. Variables: specialistName, loginUrl.',
            true, :now, :now)
         ON CONFLICT (name) DO NOTHING`,
        { replacements: { html: INVITATION_HTML, text: INVITATION_TEXT, now } },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) => queryInterface.sequelize.query(sql, { transaction, ...opts });

      await q(`DELETE FROM email_templates WHERE name = 'specialist_invitation'`);
    });
  },
};
