'use strict';

/**
 * Migration: 20260712000004-appointment-emails-office-location
 *
 * Inserts the {{office_location_html}} placeholder into both appointment
 * confirmation email templates (online + in-person).
 *
 * The placeholder is rendered by appointment-notification.service.ts as a
 * pre-sanitized HTML block containing a "Ver ubicación en el mapa" button
 * when the office has a map_url set, or as an empty string otherwise.
 * Because the template engine substitutes a missing/empty variable with '',
 * offices without a map URL are unaffected — the block simply disappears.
 *
 * Placement: immediately after the .info-box div in both templates.
 *
 * down: no-op — the placeholder renders to '' for existing rows that lack
 * map_url, so the emails look identical to their pre-migration state.
 * A full rollback would require storing the old HTML, which adds complexity
 * with no practical benefit.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const onlineHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cita confirmada</title>
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
    .meet-btn { display: inline-block; background: #0d9488; color: #fff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 700; font-size: 15px; margin: 20px 0; }
    .footer { padding: 20px 32px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Delta Medical CRM</h1>
      <p>Confirmación de cita &mdash; Videoconsulta</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{patient_name}}</strong>,</p>
      <p>Su cita ha sido <span class="badge">CONFIRMADA</span></p>
      <div class="info-box">
        <p><strong>Médico:</strong> {{doctor_name}}</p>
        <p><strong>Fecha:</strong> {{appointment_date}}</p>
        <p><strong>Hora:</strong> {{appointment_time}}</p>
      </div>
      {{office_location_html}}
      <p>Su consulta se realizará por videollamada. Haga clic en el botón para unirse:</p>
      <p><a class="meet-btn" href="{{meet_link}}">Unirse a la videoconsulta</a></p>
      <p style="font-size:13px;color:#64748b;">
        O copie este enlace en su navegador:
        <a href="{{meet_link}}" style="color:#0d9488;">{{meet_link}}</a>
      </p>
      <p>Si necesita cancelar o reprogramar, comuníquese con el médico con anticipación.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    const inPersonHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cita confirmada</title>
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
      <p>Confirmación de cita &mdash; Presencial</p>
    </div>
    <div class="body">
      <p>Estimado/a <strong>{{patient_name}}</strong>,</p>
      <p>Su cita ha sido <span class="badge">CONFIRMADA</span></p>
      <div class="info-box">
        <p><strong>Médico:</strong> {{doctor_name}}</p>
        <p><strong>Fecha:</strong> {{appointment_date}}</p>
        <p><strong>Hora:</strong> {{appointment_time}}</p>
        <p><strong>Consultorio:</strong> {{office_name}}</p>
        <p><strong>Dirección:</strong> {{office_address}}</p>
      </div>
      {{office_location_html}}
      <p>Le esperamos en la dirección indicada. Si necesita cancelar o reprogramar, comuníquese con el médico con anticipación.</p>
    </div>
    <div class="footer">Delta Medical CRM &mdash; Sistema de Gestión Médica</div>
  </div>
</body>
</html>`;

    await queryInterface.sequelize.query(
      `UPDATE email_templates
         SET html = :html, updated_at = NOW()
       WHERE name = 'appointment_confirmation_online'`,
      { replacements: { html: onlineHtml } },
    );

    await queryInterface.sequelize.query(
      `UPDATE email_templates
         SET html = :html, updated_at = NOW()
       WHERE name = 'appointment_confirmation_inperson'`,
      { replacements: { html: inPersonHtml } },
    );
  },

  async down(_queryInterface) {
    // no-op: the placeholder renders to '' when office_location_html is absent/empty,
    // so rolling back the column migration (20260712000003) is sufficient to
    // restore the pre-feature email appearance without touching the HTML here.
  },
};
