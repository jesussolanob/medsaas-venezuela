import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when creating a patient request for a patient with no registered email.
 *
 * The code is sent via email — without an email address the patient can never
 * access the portal, so the doctor receives a clear early error instead of
 * the patient facing a dead-end later.
 */
export class PatientHasNoEmailError extends DomainError {
  readonly code = 'PATIENT_HAS_NO_EMAIL';
  override readonly httpStatus = 422;

  constructor() {
    super(
      'El paciente no tiene dirección de correo registrada. ' +
        'Agrega un correo al paciente antes de enviar solicitudes.',
    );
  }
}
