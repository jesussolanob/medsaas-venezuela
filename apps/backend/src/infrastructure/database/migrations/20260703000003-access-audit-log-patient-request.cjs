'use strict';

/**
 * Migration: 20260703000003-access-audit-log-patient-request
 *
 * Extends the access_audit_log_field_check constraint to allow
 * 'patient_request_detail' as a valid value for field_revealed.
 *
 * Background: GET /api/doctor/patient-requests/:id reveals PHI (the patient's
 * uploaded attachments + written response) and must be traced in
 * access_audit_log. Without this value the audit insert silently fails the
 * CHECK constraint (the use case swallows the error fire-and-forget), so no
 * audit row is written. This migration adds the aggregate value without
 * removing any existing allowed values.
 *
 * Constraint before: full_name, cedula, phone, email, diagnosis,
 *                    treatment_plan, medication, dosage, chief_complaint,
 *                    treatment, full_record
 * Constraint after:  all of the above + patient_request_detail
 *
 * Technique: DROP + re-ADD (PostgreSQL does not support ALTER CONSTRAINT for
 * CHECK constraints). Raw SQL via queryInterface.sequelize.query as used by
 * 20260609000000-access-audit-log-full-record.cjs.
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
          'full_record','patient_request_detail'
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
          'full_record'
        ));
    `);
  },
};
