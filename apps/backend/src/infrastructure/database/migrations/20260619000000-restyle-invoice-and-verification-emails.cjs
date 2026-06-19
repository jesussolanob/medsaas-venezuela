/**
 * Migration: 20260619000000-restyle-invoice-and-verification-emails
 *
 * Restyles two email templates that were off-brand (did not match the app's
 * teal/slate design system used by every other template):
 *   - `invoice`                      → used Google-blue (#1a73e8) palette
 *   - `doctor_pending_verification`  → bare gray (#f5f5f5) fragment, no wrapper
 *
 * up()  : UPDATE both templates' `html` to the teal/slate house style
 *         (header #0d9488, slate body, consistent container + footer).
 * down(): revert both to their previous HTML.
 *
 * Only the `html` column changes — subject/text/variables are preserved, so
 * the EmailService template-variable substitution keeps working unchanged.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

const INVOICE_HTML_NEW = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Factura {{invoiceNumber}}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .invoice-table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    .invoice-table th, .invoice-table td { text-align: left; padding: 10px 12px; font-size: 14px; }
    .invoice-table th { background: #f0fdfa; color: #0d9488; font-weight: 600; }
    .invoice-table td { border-bottom: 1px solid #e2e8f0; color: #334155; }
    .total-row td { font-weight: 700; font-size: 16px; color: #0f766e; border-top: 2px solid #0d9488; border-bottom: none; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Factura de Suscripción</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{doctorName}}</strong>,</p>
      <p>Adjuntamos el detalle de su factura correspondiente al servicio de plataforma Delta Medical.</p>
      <table class="invoice-table">
        <thead>
          <tr><th>Concepto</th><th>Detalle</th></tr>
        </thead>
        <tbody>
          <tr><td>Número de factura</td><td>{{invoiceNumber}}</td></tr>
          <tr><td>Fecha de emisión</td><td>{{date}}</td></tr>
          <tr><td>Descripción</td><td>{{description}}</td></tr>
          <tr class="total-row"><td>Total a pagar</td><td>{{amount}}</td></tr>
        </tbody>
      </table>
      <p style="margin-top: 24px; font-size: 13px; color: #64748b;">
        Para cualquier consulta sobre esta factura, comuníquese con el equipo de soporte Delta Medical.
      </p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

const VERIFICATION_HTML_NEW = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nuevo doctor pendiente de verificación</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .data-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
    .data-table td { padding: 8px 12px; border: 1px solid #e2e8f0; color: #334155; }
    .data-table td.label { font-weight: 600; background: #f1f5f9; color: #0f172a; width: 45%; }
    .btn { display: inline-block; margin-top: 8px; background: #0d9488; color: #fff !important; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Nuevo doctor pendiente de verificación</p>
    </div>
    <div class="body">
      <p>Hola,</p>
      <p>Un nuevo doctor ha completado su registro y está pendiente de verificación.</p>
      <table class="data-table">
        <tr><td class="label">Nombre completo</td><td>{{fullName}}</td></tr>
        <tr><td class="label">Cédula</td><td>{{cedula}}</td></tr>
        <tr><td class="label">Correo electrónico</td><td>{{doctorEmail}}</td></tr>
        <tr><td class="label">Especialidad</td><td>{{specialty}}</td></tr>
        <tr><td class="label">Número MPPS</td><td>{{mppsNumber}}</td></tr>
        <tr><td class="label">Número de colegiado</td><td>{{colegiadoNumber}}</td></tr>
        <tr><td class="label">ID del doctor</td><td>{{doctorId}}</td></tr>
      </table>
      <p><a class="btn" href="https://deltamedical.app/admin/doctor-verifications">Revisar en el panel</a></p>
      <p style="font-size: 13px; color: #64748b;">Saludos,<br>Sistema Delta Medical</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

const INVOICE_HTML_OLD = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Factura {{invoiceNumber}}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1a1a2e; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; }
    .header { background: #1a73e8; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 32px; }
    .invoice-table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    .invoice-table th, .invoice-table td { text-align: left; padding: 10px 12px; font-size: 14px; }
    .invoice-table th { background: #f0f4ff; color: #1a73e8; font-weight: 600; }
    .invoice-table td { border-bottom: 1px solid #eee; }
    .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #1a73e8; border-bottom: none; }
    .footer { padding: 20px 32px; font-size: 12px; color: #888; text-align: center; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Factura de Suscripción</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{doctorName}}</strong>,</p>
      <p>Adjuntamos el detalle de su factura correspondiente al servicio de plataforma Delta Medical.</p>
      <table class="invoice-table">
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Número de factura</td>
            <td>{{invoiceNumber}}</td>
          </tr>
          <tr>
            <td>Fecha de emisión</td>
            <td>{{date}}</td>
          </tr>
          <tr>
            <td>Descripción</td>
            <td>{{description}}</td>
          </tr>
          <tr class="total-row">
            <td>Total a pagar</td>
            <td>{{amount}}</td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top: 24px; font-size: 13px; color: #555;">
        Para cualquier consulta sobre esta factura, comuníquese con el equipo de soporte Delta Medical.
      </p>
    </div>
    <div class="footer">
      Delta Medical CRM &mdash; Sistema de Gestión Médica
    </div>
  </div>
</body>
</html>`;

const VERIFICATION_HTML_OLD = `<p>Hola,</p>
<p>Un nuevo doctor ha completado su registro en Delta Medical CRM y está pendiente de verificación.</p>
<table style="border-collapse:collapse;width:100%;max-width:520px;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #ddd">Nombre completo</td><td style="padding:6px 12px;border:1px solid #ddd">{{fullName}}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #ddd">Cédula</td><td style="padding:6px 12px;border:1px solid #ddd">{{cedula}}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #ddd">Correo electrónico</td><td style="padding:6px 12px;border:1px solid #ddd">{{doctorEmail}}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #ddd">Especialidad</td><td style="padding:6px 12px;border:1px solid #ddd">{{specialty}}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #ddd">Número MPPS</td><td style="padding:6px 12px;border:1px solid #ddd">{{mppsNumber}}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #ddd">Número de colegiado</td><td style="padding:6px 12px;border:1px solid #ddd">{{colegiadoNumber}}</td></tr>
  <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #ddd">ID del doctor</td><td style="padding:6px 12px;border:1px solid #ddd">{{doctorId}}</td></tr>
</table>
<p>Por favor, ingresa al <a href="https://deltamedical.app/admin/doctor-verifications">panel de administración</a> para revisar y verificar o rechazar su perfil.</p>
<p>Saludos,<br>Sistema Delta Medical</p>`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates SET html = :html, updated_at = NOW() WHERE name = :name`,
      { replacements: { html: INVOICE_HTML_NEW, name: 'invoice' } },
    );
    await queryInterface.sequelize.query(
      `UPDATE email_templates SET html = :html, updated_at = NOW() WHERE name = :name`,
      { replacements: { html: VERIFICATION_HTML_NEW, name: 'doctor_pending_verification' } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates SET html = :html, updated_at = NOW() WHERE name = :name`,
      { replacements: { html: INVOICE_HTML_OLD, name: 'invoice' } },
    );
    await queryInterface.sequelize.query(
      `UPDATE email_templates SET html = :html, updated_at = NOW() WHERE name = :name`,
      { replacements: { html: VERIFICATION_HTML_OLD, name: 'doctor_pending_verification' } },
    );
  },
};
