/**
 * Migration: 20260611000008-doctor-verification-email-enrich
 *
 * Updates the `doctor_pending_verification` email template to include
 * the doctor's full name, cedula, email, specialty, MPPS number, and
 * colegiado number in the notification sent to super_admins.
 *
 * Idempotent up(): uses a WHERE clause that only updates when the old
 * minimal body (containing only {{doctorId}}) is still in place — so
 * re-running the migration on an already-updated DB is a no-op.
 *
 * down() restores the original minimal body.
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

const NEW_HTML = `<p>Hola,</p>
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

const NEW_TEXT = `Un nuevo doctor ha completado su registro y está pendiente de verificación.

Nombre completo : {{fullName}}
Cédula          : {{cedula}}
Correo          : {{doctorEmail}}
Especialidad    : {{specialty}}
Número MPPS     : {{mppsNumber}}
Nro. colegiado  : {{colegiadoNumber}}
ID del doctor   : {{doctorId}}

Ingresa al panel de administración para revisarlo: https://deltamedical.app/admin/doctor-verifications`;

const OLD_HTML_SNIPPET = 'ID del doctor: <strong>{{doctorId}}</strong>';

module.exports = {
  async up(queryInterface) {
    // Only update if the row still has the old minimal body (idempotent).
    await queryInterface.sequelize.query(
      `UPDATE email_templates
       SET html       = :html,
           text       = :text,
           updated_at = NOW()
       WHERE name = 'doctor_pending_verification'
         AND html LIKE :snippet`,
      {
        replacements: {
          html: NEW_HTML,
          text: NEW_TEXT,
          snippet: `%${OLD_HTML_SNIPPET}%`,
        },
      },
    );
  },

  async down(queryInterface) {
    const oldHtml = `<p>Hola,</p>
<p>Un nuevo doctor ha completado su registro en Delta Medical CRM y está pendiente de verificación.</p>
<p>ID del doctor: <strong>{{doctorId}}</strong></p>
<p>Por favor, ingresa al <a href="https://deltamedical.app/admin/doctor-verifications">panel de administración</a> para revisar y verificar o rechazar su perfil.</p>
<p>Saludos,<br>Sistema Delta Medical</p>`;

    const oldText =
      'Un nuevo doctor (ID: {{doctorId}}) está pendiente de verificación. ' +
      'Ingresa al panel de administración para revisarlo.';

    await queryInterface.sequelize.query(
      `UPDATE email_templates
       SET html       = :html,
           text       = :text,
           updated_at = NOW()
       WHERE name = 'doctor_pending_verification'`,
      { replacements: { html: oldHtml, text: oldText } },
    );
  },
};
