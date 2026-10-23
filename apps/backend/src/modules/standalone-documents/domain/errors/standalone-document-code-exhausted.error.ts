import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when all retry attempts for code generation are exhausted.
 * This is a pathological case — 5 concurrent conflicts in the same month for
 * the same doctor. Returns 422.
 */
export class StandaloneDocumentCodeExhaustedError extends DomainError {
  readonly code = 'STANDALONE_DOCUMENT_CODE_EXHAUSTED';

  constructor(yearMonth: string) {
    super(`No se pudo generar un código único para el mes ${yearMonth}. Inténtalo de nuevo.`);
  }
}
