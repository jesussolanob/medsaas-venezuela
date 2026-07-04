import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when creating a patient request for a patient with no registered cédula.
 *
 * The cédula is the second factor required during code verification.
 * Without it the patient can never authenticate against the portal.
 */
export class PatientCedulaRequiredError extends DomainError {
  readonly code = 'PATIENT_CEDULA_REQUIRED';
  override readonly httpStatus = 422;

  constructor() {
    super(
      'El paciente no tiene cédula registrada. ' +
        'Agrega la cédula al paciente antes de enviar solicitudes.',
    );
  }
}
