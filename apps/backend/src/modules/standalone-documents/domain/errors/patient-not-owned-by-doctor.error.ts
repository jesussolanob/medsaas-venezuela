import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when trying to create a standalone document for a patient that does
 * not belong to the acting doctor. Returns 404 (same as patient not found —
 * does not leak existence of foreign patients).
 */
export class PatientNotOwnedByDoctorError extends DomainError {
  readonly code = 'PATIENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Paciente no encontrado');
  }
}
