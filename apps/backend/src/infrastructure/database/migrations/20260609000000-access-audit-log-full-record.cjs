'use strict';

/**
 * Migration: 20260609000000-access-audit-log-full-record
 *
 * Extends the access_audit_log_field_check constraint to allow 'full_record'
 * as a valid value for field_revealed.
 *
 * Background: GET /api/patients/:id now inserts a single audit row with
 * field_revealed='full_record' instead of one row per PII field. The original
 * CHECK constraint only covered individual field names; this migration adds
 * the aggregate value without removing any existing allowed values.
 *
 * Constraint before: full_name, cedula, phone, email, diagnosis,
 *                    treatment_plan, medication, dosage, chief_complaint, treatment
 * Constraint after:  all of the above + full_record
 *
 * Technique: DROP + re-ADD (PostgreSQL does not support ALTER CONSTRAINT for
 * CHECK constraints). Raw SQL via queryInterface.sequelize.query as used
 * elsewhere in this migration set.
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
          'full_record'
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
          'dosage','chief_complaint','treatment'
        ));
    `);
  },
};
