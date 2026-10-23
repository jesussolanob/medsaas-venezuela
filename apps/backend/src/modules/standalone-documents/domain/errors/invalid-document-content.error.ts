import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the content payload does not match the document's stored type.
 * Returns 422 Unprocessable Entity (default DomainError behavior).
 *
 * Example: sending paraclinical content to a recipe document.
 */
export class InvalidDocumentContentError extends DomainError {
  readonly code = 'INVALID_DOCUMENT_CONTENT';

  constructor(docType: string) {
    super(`El contenido no es válido para un documento de tipo '${docType}'`);
  }
}
