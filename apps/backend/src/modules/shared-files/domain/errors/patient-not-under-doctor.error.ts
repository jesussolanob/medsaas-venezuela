import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor attempts to create a shared file for a patient they
 * do not own. Same message as NotFound to avoid patient-existence enumeration.
 */
export class PatientNotUnderDoctorError extends DomainError {
  readonly code = 'PATIENT_NOT_UNDER_DOCTOR';
  override readonly httpStatus = 404;

  constructor() {
    super('Paciente no encontrado');
  }
}
