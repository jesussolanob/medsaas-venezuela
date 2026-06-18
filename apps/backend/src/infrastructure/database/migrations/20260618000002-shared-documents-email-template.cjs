'use strict';

/**
 * Migration: 20260618000002-shared-documents-email-template
 *
 * Seeds the email template for shared document links.
 * Template name: 'shared_documents_code'
 *
 * Placeholders (resolved by MailerService at send time):
 *   {{patientName}}  — patient's full name
 *   {{doctorName}}   — doctor's display name
 *   {{code}}         — 6-digit access code
 *   {{url}}          — public link URL (e.g. /documents/:token)
 *   {{expiresAt}}    — human-readable expiry date/time
 *
 * Uses ON CONFLICT (name) DO NOTHING for idempotency.
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
  <title>Documentos médicos compartidos</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .code-box { background: #f0fdfa; border: 2px solid #0d9488; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .code-box .code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f766e; font-family: monospace; }
    .code-box .code-label { font-size: 13px; color: #64748b; margin-top: 8px; }
    .btn { display: inline-block; background: #0d9488; color: #fff; text-decoration: none; border-radius: 6px; padding: 12px 28px; font-size: 15px; font-weight: 600; margin: 16px 0; }
    .info-box { background: #fefce8; border-left: 4px solid #ca8a04; border-radius: 4px; padding: 14px 18px; margin: 20px 0; font-size: 13px; color: #713f12; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Documentos médicos compartidos</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{patientName}}</strong>,</p>
      <p>Su médico <strong>{{doctorName}}</strong> ha compartido documentos de su consulta con usted.</p>
      <p>Para acceder a sus documentos, visite el enlace a continuación e ingrese el código de verificación:</p>
      <div class="code-box">
        <div class="code">{{code}}</div>
        <div class="code-label">Código de verificación (válido hasta {{expiresAt}})</div>
      </div>
      <p style="text-align:center">
        <a class="btn" href="{{url}}">Ver mis documentos</a>
      </p>
      <p>O copie y pegue este enlace en su navegador:</p>
      <p style="word-break:break-all; font-size:13px; color:#475569;">{{url}}</p>
      <div class="info-box">
        <strong>Importante:</strong> Este enlace y código son de uso personal y confidencial.
        No los comparta con terceros. El código expira el {{expiresAt}}.
      </div>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    await queryInterface.sequelize.query(
      `INSERT INTO email_templates (id, name, subject, html, text, description, is_active, created_at, updated_at)
       VALUES (
         gen_random_uuid(),
         'shared_documents_code',
         'Sus documentos médicos están disponibles — código {{code}}',
         :html,
         NULL,
         'Código de acceso para documentos médicos compartidos por el médico',
         true,
         NOW(),
         NOW()
       )
       ON CONFLICT (name) DO NOTHING`,
      { replacements: { html } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM email_templates WHERE name = 'shared_documents_code'`,
    );
  },
};
