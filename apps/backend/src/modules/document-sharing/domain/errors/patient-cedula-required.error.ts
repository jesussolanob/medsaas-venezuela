import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor tries to share a consultation document for a patient
 * that has no cédula on file.
 *
 * The cédula is a mandatory second factor the patient enters (alongside the
 * 6-digit code) to open the shared document via verify-code. Without it the
 * link would be unusable and the patient would only ever get a generic 422.
 * Failing early with a clear, actionable message lets the doctor add the
 * patient's cédula before sharing.
 */
export class PatientCedulaRequiredForSharingError extends DomainError {
  readonly code = 'PATIENT_CEDULA_REQUIRED_FOR_SHARING';
  override readonly httpStatus = 422;

  constructor() {
    super(
      'El paciente no tiene cédula registrada. Agrega la cédula del paciente para poder compartir documentos.',
    );
  }
}
