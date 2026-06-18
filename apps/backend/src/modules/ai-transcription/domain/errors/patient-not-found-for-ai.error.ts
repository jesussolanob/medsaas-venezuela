import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the patient_history action cannot find the patient record
 * scoped to the authenticated doctor (anti-IDOR: same response for missing
 * or foreign patients).
 *
 * HTTP 404.
 */
export class PatientNotFoundForAiError extends DomainError {
  readonly code = 'AI_PATIENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Paciente no encontrado.');
  }
}
