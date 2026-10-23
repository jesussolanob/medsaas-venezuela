import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when trying to void a document that is not in issued state.
 * Returns 409 Conflict.
 */
export class StandaloneDocumentNotIssuedError extends DomainError {
  readonly code = 'STANDALONE_DOCUMENT_NOT_ISSUED';
  override readonly httpStatus = 409;

  constructor() {
    super('El documento no está emitido y no puede ser anulado');
  }
}
