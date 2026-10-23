import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a standalone document does not exist or belongs to another doctor.
 * Returns 404 — intentionally generic (anti-IDOR).
 */
export class StandaloneDocumentNotFoundError extends DomainError {
  readonly code = 'STANDALONE_DOCUMENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Documento no encontrado');
  }
}
