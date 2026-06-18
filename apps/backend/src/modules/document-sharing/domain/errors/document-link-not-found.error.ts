import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a shared document link is not found by token.
 *
 * SECURITY: returns 404 so callers cannot distinguish between a link that
 * never existed and one that belongs to another doctor.
 */
export class DocumentLinkNotFoundError extends DomainError {
  readonly code = 'DOCUMENT_LINK_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('El enlace no existe o ya no está disponible');
  }
}
