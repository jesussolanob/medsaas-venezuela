import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a document link is found but has been revoked.
 *
 * SECURITY: same 404 status as not-found to avoid leaking state.
 */
export class DocumentLinkNotActiveError extends DomainError {
  readonly code = 'DOCUMENT_LINK_NOT_ACTIVE';
  override readonly httpStatus = 404;

  constructor() {
    super('El enlace no existe o ya no está disponible');
  }
}
