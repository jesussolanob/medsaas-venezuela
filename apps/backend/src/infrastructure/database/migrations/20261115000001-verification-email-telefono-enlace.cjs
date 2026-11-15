'use strict';

/**
 * Migration: 20261115000001-verification-email-telefono-enlace
 *
 * In the `doctor_pending_verification` email (new specialist → super admins) the
 * phone is now sent as "+58 414-1234567" plus `{{phoneTel}}` ('+584141234567').
 * This wraps the `{{phone}}` value in a `tel:` link so tapping it on a phone
 * offers to call or write (owner request, 2026-11-15). Only the value is wrapped,
 * so edits made to the row from /admin/email-templates are kept.
 * Idempotent: does nothing if `{{phoneTel}}` is already in the template.
 *
 * @type {import('sequelize-cli').Migration}
 */

const TEMPLATE = 'doctor_pending_verification';
const LINK =
  '<a href="tel:{{phoneTel}}" style="color:#0891b2;text-decoration:none;">{{phone}}</a>';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET html = replace(html, '{{phone}}', :link),
              updated_at = NOW()
        WHERE name = :template
          AND html LIKE '%{{phone}}%'
          AND html NOT LIKE '%{{phoneTel}}%'`,
      { replacements: { template: TEMPLATE, link: LINK } },
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE email_templates
          SET html = replace(html, :link, '{{phone}}'),
              updated_at = NOW()
        WHERE name = :template`,
      { replacements: { template: TEMPLATE, link: LINK } },
    );
  },
};
