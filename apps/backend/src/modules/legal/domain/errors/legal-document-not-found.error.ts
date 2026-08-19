import { DomainError } from '../../../../domain/errors/domain.error';

export class LegalDocumentNotFoundError extends DomainError {
  readonly code = 'LEGAL_DOCUMENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(docType: string) {
    super(`No hay un documento legal vigente del tipo "${docType}"`);
  }
}
