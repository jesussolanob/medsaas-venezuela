/**
 * Migration: 20260611000002-doctor-verification-email-template
 *
 * Seeds the `doctor_pending_verification` email template used by
 * CompleteRegistrationUseCase to notify super_admins when a new doctor
 * submits their registration for review.
 *
 * Idempotent: ON CONFLICT (name) DO NOTHING.
 *
 * down() removes only the seeded template (does not affect other rows).
 *
 * @type {import('sequelize-cli').Migration}
 */
'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      INSERT INTO email_templates
        (id, name, subject, html, text, is_active, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        'doctor_pending_verification',
        'Nuevo doctor pendiente de verificación',
        '<p>Hola,</p>
<p>Un nuevo doctor ha completado su registro en Delta Medical CRM y está pendiente de verificación.</p>
<p>ID del doctor: <strong>{{doctorId}}</strong></p>
<p>Por favor, ingresa al <a href="https://deltamedical.app/admin/doctor-verifications">panel de administración</a> para revisar y verificar o rechazar su perfil.</p>
<p>Saludos,<br>Sistema Delta Medical</p>',
        'Un nuevo doctor (ID: {{doctorId}}) está pendiente de verificación. Ingresa al panel de administración para revisarlo.',
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT (name) DO NOTHING
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM email_templates
      WHERE name = 'doctor_pending_verification'
    `);
  },
};
