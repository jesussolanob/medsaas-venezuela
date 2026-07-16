'use strict';

/**
 * Migration: 20260716000001-email-button-inline-color
 *
 * Problem: email clients (Gmail, Outlook) strip or override CSS class rules
 * declared inside <style> blocks, so the `.btn` rule that sets `color:#fff`
 * is ignored and the anchor renders with the client's default link color (blue).
 *
 * Fix: add `style="color:#ffffff !important; ..."` directly on every CTA anchor
 * that previously relied on the `.btn` class for its white text colour.
 *
 * Templates updated:
 *   - patient_request_code   ("Responder solicitud" button)
 *   - shared_documents_code  ("Ver mis documentos" button)
 *
 * Only the `<a>` tag in each template is changed.  The rest of the HTML
 * (structure, copy, other styles) is left unchanged to minimise diff noise
 * and risk.  The `updated_at` column exists on email_templates (created in
 * 20260608000001-email-templates.cjs) so it is safe to include in the SET.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    // -----------------------------------------------------------------
    // patient_request_code — "Responder solicitud" CTA
    // -----------------------------------------------------------------
    await queryInterface.sequelize.query(`
      UPDATE email_templates
      SET html = REPLACE(
            html,
            '<a class="btn" href="{{url}}">Responder solicitud</a>',
            '<a class="btn" href="{{url}}" style="color:#ffffff !important; text-decoration:none;">Responder solicitud</a>'
          ),
          updated_at = NOW()
      WHERE name = 'patient_request_code'
    `);

    // -----------------------------------------------------------------
    // shared_documents_code — "Ver mis documentos" CTA
    // -----------------------------------------------------------------
    await queryInterface.sequelize.query(`
      UPDATE email_templates
      SET html = REPLACE(
            html,
            '<a class="btn" href="{{url}}">Ver mis documentos</a>',
            '<a class="btn" href="{{url}}" style="color:#ffffff !important; text-decoration:none;">Ver mis documentos</a>'
          ),
          updated_at = NOW()
      WHERE name = 'shared_documents_code'
    `);
  },

  async down(queryInterface) {
    // Revert: remove the inline style from both CTAs
    await queryInterface.sequelize.query(`
      UPDATE email_templates
      SET html = REPLACE(
            html,
            '<a class="btn" href="{{url}}" style="color:#ffffff !important; text-decoration:none;">Responder solicitud</a>',
            '<a class="btn" href="{{url}}">Responder solicitud</a>'
          ),
          updated_at = NOW()
      WHERE name = 'patient_request_code'
    `);

    await queryInterface.sequelize.query(`
      UPDATE email_templates
      SET html = REPLACE(
            html,
            '<a class="btn" href="{{url}}" style="color:#ffffff !important; text-decoration:none;">Ver mis documentos</a>',
            '<a class="btn" href="{{url}}">Ver mis documentos</a>'
          ),
          updated_at = NOW()
      WHERE name = 'shared_documents_code'
    `);
  },
};
