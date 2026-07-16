import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor attempts to register a patient using their own
 * specialist email address.
 *
 * HTTP 409 Conflict — the submitted email cannot be used for this patient.
 *
 * Code: PATIENT_EMAIL_IS_DOCTOR (machine-readable, stable across releases).
 */
export class PatientEmailIsDoctorError extends DomainError {
  readonly code = 'PATIENT_EMAIL_IS_DOCTOR';
  override readonly httpStatus = 409;

  constructor() {
    super('No puedes usar tu propio correo de especialista para un paciente.');
  }
}
