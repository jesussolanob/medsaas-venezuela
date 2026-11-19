'use strict';

/**
 * Migration: 20261119000003-access-audit-log-shared-document-fields
 *
 * Extends the access_audit_log_field_check constraint to allow
 * 'shared_document_render' and 'shared_document_download' as valid values
 * for field_revealed.
 *
 * Background: get-document-render-data.use-case and download-document.use-case
 * write 'shared_document_render' and 'shared_document_download' respectively
 * into field_revealed, then move the sections detail into the reason column.
 * Without this migration the INSERT silently fails the CHECK constraint
 * (the use cases swallow the error fire-and-forget) so no audit row is ever
 * written — 0 rows in access_audit_log for all patient-document accesses since
 * the feature launched.
 *
 * The variable-length suffix that was previously appended to field_revealed
 * (e.g. 'shared_document_render:report,prescriptions+2attachments') is now
 * stored in the reason column instead, keeping field_revealed an enumerable
 * categorical value.
 *
 * Constraint before: full_name, cedula, phone, email, diagnosis,
 *                    treatment_plan, medication, dosage, chief_complaint,
 *                    treatment, full_record, patient_request_detail
 * Constraint after:  all of the above + shared_document_render,
 *                    shared_document_download
 *
 * Note: 'admin_patient_identity' (written by get-doctor-patients.use-case in
 * the admin module) is ALSO not in the current constraint — that is a
 * pre-existing gap reported to the lead for a follow-up migration.
 *
 * Technique: DROP + re-ADD (PostgreSQL does not support ALTER CONSTRAINT for
 * CHECK constraints). Raw SQL via queryInterface.sequelize.query as used by
 * previous audit-log migrations.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE access_audit_log
        DROP CONSTRAINT access_audit_log_field_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE access_audit_log
        ADD CONSTRAINT access_audit_log_field_check
        CHECK (field_revealed IN (
          'full_name','cedula','phone','email',
          'diagnosis','treatment_plan','medication',
          'dosage','chief_complaint','treatment',
          'full_record','patient_request_detail',
          'shared_document_render','shared_document_download'
        ));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE access_audit_log
        DROP CONSTRAINT access_audit_log_field_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE access_audit_log
        ADD CONSTRAINT access_audit_log_field_check
        CHECK (field_revealed IN (
          'full_name','cedula','phone','email',
          'diagnosis','treatment_plan','medication',
          'dosage','chief_complaint','treatment',
          'full_record','patient_request_detail'
        ));
    `);
  },
};
