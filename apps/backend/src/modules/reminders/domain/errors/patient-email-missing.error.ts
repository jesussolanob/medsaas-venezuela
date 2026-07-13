import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a manual reminder is requested for a patient that has no email
 * address on file (patient_email is null or empty on the appointment row).
 *
 * Returns HTTP 422 (business rule violation — the doctor should be informed
 * the email cannot be sent rather than receiving a generic 500).
 */
export class PatientEmailMissingError extends DomainError {
  readonly code = 'REMINDER_PATIENT_EMAIL_MISSING';

  constructor() {
    super('El paciente no tiene correo registrado');
  }
}
