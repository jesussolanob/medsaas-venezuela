import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when trying to edit, delete, or issue a document that is not in draft
 * state. Returns 409 Conflict.
 */
export class StandaloneDocumentNotDraftError extends DomainError {
  readonly code = 'STANDALONE_DOCUMENT_NOT_DRAFT';
  override readonly httpStatus = 409;

  constructor() {
    super('El documento no está en borrador y no puede ser modificado ni emitido');
  }
}
