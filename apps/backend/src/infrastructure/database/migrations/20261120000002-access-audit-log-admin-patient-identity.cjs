'use strict';

/**
 * Migration: 20261120000002-access-audit-log-admin-patient-identity
 *
 * Extends the access_audit_log_field_check constraint to allow
 * 'admin_patient_identity' as a valid value for field_revealed.
 *
 * Background: get-doctor-patients.use-case (GET /api/admin/doctors/:id/patients)
 * writes one audit row per patient using fieldRevealed='admin_patient_identity'.
 * The previous constraint (after 20261119000003) did not include this value, so
 * every INSERT was rejected and zero audit rows were ever written — the error was
 * silently swallowed by the fire-and-forget wrapper.
 *
 * Constraint before (after 20261119000003):
 *   full_name, cedula, phone, email, diagnosis, treatment_plan, medication,
 *   dosage, chief_complaint, treatment, full_record, patient_request_detail,
 *   shared_document_render, shared_document_download
 *
 * Constraint after:
 *   all of the above + admin_patient_identity
 *
 * Reversible: down restores the 20261119000003 list (without admin_patient_identity).
 *
 * Technique: DROP + re-ADD (PostgreSQL does not support ALTER CONSTRAINT for
 * CHECK constraints). Raw SQL via queryInterface.sequelize.query.
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
          'shared_document_render','shared_document_download',
          'admin_patient_identity'
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
          'full_record','patient_request_detail',
          'shared_document_render','shared_document_download'
        ));
    `);
  },
};
