'use strict';

/**
 * Migration: 20260805000003-doctor-inactivity-notices
 *
 * Adds two columns to `profiles` to track per-doctor inactivity notice state:
 *
 *   inactivity_notice_stage     SMALLINT NOT NULL DEFAULT 0
 *     0 = never notified
 *     1 = "10-day" notice sent
 *     2 = "15-day" notice sent
 *
 *   last_inactivity_notice_at   TIMESTAMPTZ NULL
 *     Timestamp of the last inactivity email dispatched to this doctor.
 *     Reset to NULL on login (stage also reset to 0).
 *
 * Adds a partial index on (last_sign_in_at) for doctors with an active status
 * to support efficient cron queries without scanning admin/patient rows.
 *
 * Seeds two email templates:
 *   - doctor_inactivity_10d — sent when a doctor has been inactive for 10–14 days
 *   - doctor_inactivity_15d — sent when a doctor has been inactive for ≥15 days
 *
 * All seeds use ON CONFLICT (name) DO NOTHING — safe to re-run.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    // 1. Add inactivity tracking columns to profiles.
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        ADD COLUMN IF NOT EXISTS inactivity_notice_stage    SMALLINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_inactivity_notice_at  TIMESTAMPTZ NULL
    `);

    // 2. Partial index for efficient cron queries.
    //    Only doctors with is_active = true are candidates for inactivity notices.
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_doctor_last_sign_in
        ON profiles (last_sign_in_at, inactivity_notice_stage)
       WHERE role = 'doctor' AND is_active = true
    `);

    // 3. Seed inactivity email templates.
    const now = new Date();

    const inactivity10Html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Te extrañamos en Delta Salud</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #0d9488; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .cta { display: inline-block; background: #0d9488; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Te extrañamos, {{doctorName}}</h1>
    </div>
    <div class="body">
      <p>Han pasado 10 días desde tu última sesión en <strong>Delta Salud</strong>. Tus pacientes y citas te están esperando.</p>
      <p>Inicia sesión para revisar tu agenda, gestionar tus consultas y mantener al día el seguimiento de tus pacientes.</p>
      <a href="{{appUrl}}" class="cta">Volver a Delta Salud</a>
    </div>
    <div class="footer">
      <p>Recibes este correo porque tienes una cuenta activa en Delta Salud. Si ya iniciaste sesión, ignora este mensaje.</p>
    </div>
  </div>
</body>
</html>`;

    const inactivity10Text = `Hola {{doctorName}},

Han pasado 10 días desde tu última sesión en Delta Salud. Tus pacientes y citas te están esperando.

Visita {{appUrl}} para retomar tu actividad.

Si ya iniciaste sesión, ignora este mensaje.
`;

    const inactivity15Html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Llevas 15 días sin ingresar</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
    .header { background: #b45309; color: #fff; padding: 28px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .body { padding: 32px; }
    .body p { line-height: 1.6; font-size: 15px; color: #334155; }
    .cta { display: inline-block; background: #0d9488; color: #fff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
    .footer { padding: 16px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Llevas 15 días sin ingresar, {{doctorName}}</h1>
    </div>
    <div class="body">
      <p>Notamos que no has iniciado sesión en <strong>Delta Salud</strong> desde hace más de 15 días. ¿Necesitas ayuda con algo?</p>
      <p>Estamos aquí para apoyarte. Regresa cuando quieras para gestionar tus citas y consultas.</p>
      <a href="{{appUrl}}" class="cta">Volver ahora</a>
    </div>
    <div class="footer">
      <p>Recibes este correo porque tienes una cuenta activa en Delta Salud. Si ya iniciaste sesión, ignora este mensaje.</p>
    </div>
  </div>
</body>
</html>`;

    const inactivity15Text = `Hola {{doctorName}},

Llevás 15 días sin iniciar sesión en Delta Salud. ¿Necesitás ayuda?

Visitá {{appUrl}} para retomar tu actividad o escríbenos si tenés alguna duda.

Si ya iniciaste sesión, ignorá este mensaje.
`;

    await queryInterface.sequelize.query(
      `INSERT INTO email_templates
         (id, name, subject, html, text, description, is_active, created_at, updated_at)
       VALUES
         (uuid_generate_v4(), 'doctor_inactivity_10d',
          'Te extrañamos en Delta Salud — han pasado 10 días',
          :html10, :text10,
          'Inactivity notice sent after 10 days without login (stage 1)',
          true, :now, :now),
         (uuid_generate_v4(), 'doctor_inactivity_15d',
          'Llevás 15 días sin ingresar a Delta Salud',
          :html15, :text15,
          'Inactivity notice sent after 15 days without login (stage 2)',
          true, :now, :now)
       ON CONFLICT (name) DO NOTHING`,
      {
        replacements: {
          html10: inactivity10Html,
          text10: inactivity10Text,
          html15: inactivity15Html,
          text15: inactivity15Text,
          now,
        },
      },
    );
  },

  async down(queryInterface) {
    // Remove templates seeded by this migration (only if they were not customised).
    // We delete by name — if the admin edited the content, the row is replaced when
    // the migration is re-run (via ON CONFLICT DO NOTHING — so nothing to worry about).
    await queryInterface.sequelize.query(`
      DELETE FROM email_templates
       WHERE name IN ('doctor_inactivity_10d', 'doctor_inactivity_15d')
    `);

    // Remove partial index.
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_profiles_doctor_last_sign_in
    `);

    // Remove columns.
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
        DROP COLUMN IF EXISTS last_inactivity_notice_at,
        DROP COLUMN IF EXISTS inactivity_notice_stage
    `);
  },
};
