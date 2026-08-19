import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown by IConsultationRepository.save() when the consultation_code already
 * exists in the database (UNIQUE constraint violation).
 *
 * This is distinct from ConsultationCodeExhaustedError (which signals that all
 * retry attempts have been consumed). This error is thrown on each individual
 * collision so the use case can increment the sequence and retry.
 */
export class ConsultationCodeConflictError extends DomainError {
  readonly code = 'CONSULTATION_CODE_CONFLICT';

  constructor(code: string) {
    super(`El código de consulta "${code}" ya está en uso`);
  }
}
