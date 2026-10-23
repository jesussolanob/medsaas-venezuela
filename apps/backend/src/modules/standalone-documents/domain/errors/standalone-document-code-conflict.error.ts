import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown by the repository when a DB UNIQUE constraint fires on
 * (doctor_id, code). The use case catches this and retries with the
 * next sequence number (same pattern as ConsultationCodeConflictError).
 */
export class StandaloneDocumentCodeConflictError extends DomainError {
  readonly code = 'STANDALONE_DOCUMENT_CODE_CONFLICT';

  constructor(public readonly conflictedCode: string) {
    super(`Código ${conflictedCode} ya existe — reintentando con el siguiente número`);
  }
}
