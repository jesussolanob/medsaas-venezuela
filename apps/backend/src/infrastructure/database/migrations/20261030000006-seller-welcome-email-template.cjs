'use strict';

/**
 * Migration: 20261030000006-seller-welcome-email-template
 *
 * Seeds the `seller_welcome` email template sent to new sellers when the
 * super admin creates their account.
 *
 * SEEDS (ON CONFLICT DO NOTHING — never overwrites admin edits):
 *   - `email_templates`: seller_welcome
 *
 * NOTES:
 *   - `email_templates.recipient_type` is a TEXT column (no Postgres enum),
 *     so no ALTER TYPE is needed for 'seller'.
 *   - The CTA button carries BOTH a CSS class AND inline style attributes so
 *     email clients that strip <style> blocks still render the correct color
 *     (same pattern applied by 20260716000001-email-button-inline-color.cjs).
 *   - Variables: sellerName, sellerEmail, sellerCode, referralUrl, loginUrl.
 *
 * @type {import('sequelize-cli').Migration}
 */

// ---------------------------------------------------------------------------
// Email template body
// ---------------------------------------------------------------------------

const WELCOME_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido/a al programa de vendedores — Delta Salud</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.7; font-size: 15px; color: #334155; margin: 0 0 16px 0; }
    .highlight { background: #f0fdfa; border-left: 3px solid #0d9488; padding: 14px 18px; border-radius: 0 6px 6px 0; margin: 20px 0; color: #0f5c55; font-size: 15px; line-height: 1.6; }
    .code-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin: 16px 0; text-align: center; }
    .code-block .code { font-family: monospace; font-size: 28px; font-weight: 700; color: #0d9488; letter-spacing: 4px; }
    .code-block .link { font-size: 13px; color: #64748b; margin-top: 6px; word-break: break-all; }
    .steps { margin: 20px 0; }
    .step { display: flex; gap: 12px; margin-bottom: 14px; align-items: flex-start; }
    .step-num { background: #0d9488; color: #fff; border-radius: 50%; width: 24px; height: 24px; min-width: 24px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
    .step-text { font-size: 14px; color: #334155; line-height: 1.6; padding-top: 2px; }
    .warning { background: #fef9c3; border-left: 3px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; margin: 16px 0; font-size: 13px; color: #78350f; }
    .section-title { font-size: 14px; font-weight: 700; color: #0f172a; margin: 24px 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .portal-list { list-style: none; padding: 0; margin: 0 0 16px 0; }
    .portal-list li { padding: 6px 0; font-size: 14px; color: #334155; padding-left: 20px; position: relative; }
    .portal-list li::before { content: "→"; position: absolute; left: 0; color: #0d9488; font-weight: 700; }
    .cta-wrap { text-align: center; margin: 28px 0 8px; }
    .cta { display: inline-block; background: #0d9488; color: #fff !important; padding: 14px 36px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 16px; letter-spacing: 0.2px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Bienvenido/a al programa de vendedores, {{sellerName}}</h1>
    </div>
    <div class="body">
      <p>Hola <strong>{{sellerName}}</strong>,</p>
      <p>Tu cuenta de vendedor en Delta Salud ya está lista. Eres parte del programa de referidos: cuando especialistas de salud se registren con tu código, el sistema los atribuye a ti y genera comisiones automáticamente según su actividad en la plataforma.</p>

      <p class="section-title">Cómo acceder a tu portal</p>
      <div class="steps">
        <div class="step">
          <span class="step-num">1</span>
          <span class="step-text">Entra a <strong>{{loginUrl}}</strong> en tu navegador.</span>
        </div>
        <div class="step">
          <span class="step-num">2</span>
          <span class="step-text">Inicia sesión con exactamente este correo: <strong>{{sellerEmail}}</strong></span>
        </div>
        <div class="step">
          <span class="step-num">3</span>
          <span class="step-text">Si usas Gmail, el método más fácil es <strong>"Continuar con Google"</strong>. Si no, crea una cuenta con ese mismo correo.</span>
        </div>
        <div class="step">
          <span class="step-num">4</span>
          <span class="step-text">El sistema te lleva automáticamente a tu portal de vendedor.</span>
        </div>
      </div>

      <div class="warning">
        ⚠️ <strong>Importante:</strong> si inicias sesión con un correo diferente a <strong>{{sellerEmail}}</strong>, el sistema crea una cuenta nueva de especialista en lugar de acceder a tu portal. Usa siempre exactamente el correo registrado.
      </div>

      <p class="section-title">Tu código de referido</p>
      <div class="code-block">
        <div class="code">{{sellerCode}}</div>
        <div class="link">Enlace de referido: {{referralUrl}}</div>
      </div>
      <p>Comparte este código o enlace con los especialistas que quieres referir. Al usarlo al registrarse, quedan atribuidos a ti y se generan comisiones por su actividad.</p>

      <p class="section-title">¿Qué vas a encontrar en tu portal?</p>
      <ul class="portal-list">
        <li><strong>Inicio</strong> — resumen de tu actividad y comisiones recientes.</li>
        <li><strong>Especialistas</strong> — lista de los especialistas que referiste y su estado en la plataforma.</li>
        <li><strong>Comisiones</strong> — detalle de cada comisión generada y su estado (pendiente o pagada).</li>
        <li><strong>Datos de cobro</strong> — carga cómo quieres recibir tus pagos (Pago Móvil, Zelle, transferencia, etc.).</li>
      </ul>

      <div class="highlight">
        <strong>Primer paso recomendado:</strong> una vez que ingreses, completa tus <strong>Datos de cobro</strong> para que podamos pagarte las comisiones sin demoras.
      </div>

      <div class="cta-wrap">
        <a href="{{loginUrl}}" class="cta" style="display:inline-block;background:#0d9488;color:#ffffff;padding:14px 36px;border-radius:6px;text-decoration:none;font-weight:700;font-size:16px;">Entrar a mi portal</a>
      </div>
    </div>
    <div class="footer">
      <p>Este correo fue generado automáticamente por Delta Salud. Si no esperabas este mensaje, puedes ignorarlo.</p>
    </div>
  </div>
</body>
</html>`;

const WELCOME_TEXT = `Bienvenido/a al programa de vendedores de Delta Salud, {{sellerName}}

Hola {{sellerName}},

Tu cuenta de vendedor en Delta Salud ya está lista.

CÓMO ACCEDER A TU PORTAL
1. Entra a {{loginUrl}}
2. Inicia sesión con exactamente este correo: {{sellerEmail}}
3. Si usas Gmail, puedes usar "Continuar con Google". Si no, crea una cuenta con ese mismo correo.
4. El sistema te lleva directo a tu portal de vendedor.

IMPORTANTE: si inicias sesión con un correo diferente a {{sellerEmail}}, el sistema crea una
cuenta nueva de especialista. Usa siempre exactamente el correo registrado.

TU CÓDIGO DE REFERIDO
Código: {{sellerCode}}
Enlace: {{referralUrl}}

Comparte este código o enlace con los especialistas que quieres referir.

EN TU PORTAL ENCUENTRAS
→ Inicio — resumen de actividad y comisiones
→ Especialistas — los que referiste y su estado
→ Comisiones — detalle de cada comisión generada
→ Datos de cobro — carga cómo quieres recibir tus pagos

PRIMER PASO: completa tus Datos de cobro para que podamos pagarte las comisiones sin demoras.

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
            'seller_welcome',
            'Bienvenido/a al programa de vendedores de Delta Salud',
            :html, :text,
            'Welcome email sent to new sellers when a super_admin creates their account. Variables: sellerName, sellerEmail, sellerCode, referralUrl, loginUrl.',
            true, :now, :now)
         ON CONFLICT (name) DO NOTHING`,
        { replacements: { html: WELCOME_HTML, text: WELCOME_TEXT, now } },
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql, opts = {}) => queryInterface.sequelize.query(sql, { transaction, ...opts });

      await q(`DELETE FROM email_templates WHERE name = 'seller_welcome'`);
    });
  },
};
