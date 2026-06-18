'use strict';

/**
 * Migration: 20260618000004-update-shared-docs-email-template-cedula
 *
 * Updates the 'shared_documents_code' email template to inform patients that
 * they must provide BOTH their cédula AND the access code to download documents.
 *
 * All existing placeholders are preserved:
 *   {{patientName}}, {{doctorName}}, {{code}}, {{url}}, {{expiresAt}}
 *
 * The down() function restores the previous template text exactly as it was
 * seeded in migration 20260618000002-shared-documents-email-template.cjs.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const newHtml = `<!DOCTYPE html>
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
    .steps-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px 22px; margin: 20px 0; }
    .steps-box ol { margin: 8px 0 0; padding-left: 20px; color: #334155; font-size: 14px; line-height: 1.8; }
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
      <p>Para acceder a sus documentos, visite el enlace a continuación y siga los siguientes pasos:</p>
      <div class="steps-box">
        <ol>
          <li>Ingrese su <strong>número de cédula</strong> (el mismo registrado en su historia clínica).</li>
          <li>Ingrese el <strong>código de verificación</strong> que aparece a continuación.</li>
        </ol>
      </div>
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
        <strong>Importante:</strong> Para descargar sus documentos necesitará su cédula de identidad y este código.
        Este enlace y código son de uso personal y confidencial — no los comparta con terceros.
        El código expira el {{expiresAt}}.
      </div>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    const newSubject = 'Sus documentos médicos están disponibles — código {{code}}';

    await queryInterface.sequelize.query(
      `UPDATE email_templates
       SET html = :html,
           subject = :subject,
           updated_at = NOW()
       WHERE name = 'shared_documents_code'`,
      { replacements: { html: newHtml, subject: newSubject } },
    );
  },

  async down(queryInterface) {
    const previousHtml = `<!DOCTYPE html>
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

    const previousSubject = 'Sus documentos médicos están disponibles — código {{code}}';

    await queryInterface.sequelize.query(
      `UPDATE email_templates
       SET html = :html,
           subject = :subject,
           updated_at = NOW()
       WHERE name = 'shared_documents_code'`,
      { replacements: { html: previousHtml, subject: previousSubject } },
    );
  },
};
