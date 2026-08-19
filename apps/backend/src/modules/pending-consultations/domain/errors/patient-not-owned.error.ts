import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when the requested patient_id does not exist or belongs to a different doctor.
 * Anti-IDOR: identical error for both cases so callers cannot enumerate patients.
 */
export class PatientNotOwnedError extends DomainError {
  override readonly code = 'PATIENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_patientId?: string) {
    super('Paciente no encontrado');
  }
}
