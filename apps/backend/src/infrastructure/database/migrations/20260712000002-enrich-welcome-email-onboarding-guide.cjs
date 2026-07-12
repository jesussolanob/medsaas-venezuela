'use strict';

/**
 * Migration: 20260712000002-enrich-welcome-email-onboarding-guide
 *
 * Replaces the `welcome` email template with an enriched onboarding guide.
 *
 * Changes:
 *   - Subject updated to use the correct brand name (Delta Salud) and adds
 *     the {{doctorName}} variable.
 *   - HTML fully rewritten:
 *     · Correct brand: "Delta Salud" (replaces old "Delta Medical CRM").
 *     · Numbered first-steps guide (profile/logo/firma, consultorio/horarios,
 *       link público, pacientes/consultas/documentos, finanzas).
 *     · CTA button "Ir a mi panel" pointing to {{appUrl}}/doctor.
 *     · Styles inline and consistent with the other templates in the seed.
 *   - Variables used: {{doctorName}}, {{appUrl}}.
 *
 * down() is a no-op: data-migration of branding/content; reverting to the old
 * "Delta Medical CRM" text would leave the app in a broken brand state and the
 * original HTML is preserved in the previous seed migration
 * (20260608000002-email-templates-seed.cjs). A full revert of that seed is the
 * correct recovery path, not a partial down() here.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const subject = 'Bienvenido/a a Delta Salud, {{doctorName}}';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido/a a Delta Salud</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .steps-title { font-size: 16px; font-weight: 700; color: #0f766e; margin: 24px 0 12px; }
    ol.steps { margin: 0 0 24px; padding-left: 24px; }
    ol.steps li { padding: 6px 0; font-size: 14px; color: #334155; line-height: 1.6; }
    ol.steps li strong { color: #1e293b; }
    .cta-wrap { text-align: center; margin: 28px 0 20px; }
    .cta-btn { display: inline-block; background: #0d9488; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700; letter-spacing: 0.01em; }
    .support-note { font-size: 13px; color: #64748b; margin-top: 24px; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Salud</h1>
      <p>Plataforma de Gestión Médica para Especialistas</p>
    </div>
    <div class="body">
      <p>Estimado/a Dr/a. <strong>{{doctorName}}</strong>,</p>
      <p>Le damos la bienvenida a <strong>Delta Salud</strong>, la plataforma de gestión clínica diseñada para médicos especialistas en Venezuela. Su cuenta está activa y tiene acceso completo a todas las funcionalidades de la plataforma.</p>

      <p class="steps-title">Primeros pasos para configurar tu cuenta</p>
      <ol class="steps">
        <li>Completa tu perfil profesional y <strong>sube tu logo y tu firma</strong> en <em>Configuración → Plantillas</em>, para que tus recetas, informes y reposos salgan con tu marca.</li>
        <li>Configura tu <strong>consultorio y tus horarios de atención</strong> (días, bloques de horario y minutos entre consultas).</li>
        <li><strong>Comparte tu link público de agendamiento</strong> con tus pacientes para que reserven citas en línea.</li>
        <li><strong>Registra pacientes y crea consultas</strong>: podrás emitir récipes, informes, indicaciones, paraclínicos y reposos.</li>
        <li>Lleva el control de tus <strong>finanzas y pagos</strong> desde el panel.</li>
      </ol>

      <div class="cta-wrap">
        <a href="{{appUrl}}/doctor" class="cta-btn">Ir a mi panel</a>
      </div>

      <p class="support-note">Si tiene alguna pregunta o necesita ayuda para comenzar, nuestro equipo de soporte está disponible para asistirle.</p>
    </div>
    <div class="footer">Delta Salud &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET subject    = :subject,
              html       = :html,
              updated_at = NOW()
        WHERE name = 'welcome'`,
      { replacements: { subject, html } },
    );
  },

  async down() {
    // No-op: data-migration of branding and content.
    // The original template is preserved in migration
    // 20260608000002-email-templates-seed.cjs. Reverting to the old
    // "Delta Medical CRM" copy is not safe from a brand perspective;
    // re-running the seed migration down() + up() is the correct
    // recovery path if needed.
  },
};
