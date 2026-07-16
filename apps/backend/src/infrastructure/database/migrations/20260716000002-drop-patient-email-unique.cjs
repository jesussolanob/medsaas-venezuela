'use strict';

/**
 * Migration: 20260716000002-drop-patient-email-unique
 *
 * Business rule (2026-07-16, aclarado por el usuario): el EMAIL de un paciente
 * PUEDE repetirse libremente — p.ej. un hijo que registra consultas para sus
 * padres adultos mayores (o para sí mismo y otros familiares) usando un mismo
 * correo, o pacientes sin correo. Lo único que NO se puede repetir es la
 * IDENTIFICACIÓN (cédula), que se sigue validando en los use-cases
 * create/update-patient. El correo del PROPIO doctor sigue rechazado
 * (PatientEmailIsDoctorError).
 *
 * Por eso se elimina el índice UNIQUE por-doctor sobre el email
 * (`patients_doctor_email_uq`, creado en 20260602000000-initial-schema).
 * El índice NO-único de búsqueda sobre `email_search_hash` (mismo esquema
 * inicial) se conserva — solo se dropea el UNIQUE.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS patients_doctor_email_uq;');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS patients_doctor_email_uq
        ON patients(doctor_id, email_search_hash)
        WHERE email_search_hash IS NOT NULL;
    `);
  },
};
