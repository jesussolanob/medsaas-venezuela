import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a patientId is supplied in a finance operation but the patient
 * does not belong to the requesting doctor (anti-IDOR gate).
 *
 * Returns 404 (not 403) to avoid leaking patient existence to unauthorised actors.
 */
export class PatientNotOwnedError extends DomainError {
  readonly code = 'PATIENT_NOT_OWNED';
  override readonly httpStatus = 404;

  constructor() {
    super('Paciente no encontrado');
  }
}
