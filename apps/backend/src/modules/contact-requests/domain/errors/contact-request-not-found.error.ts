import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a contact request is not found (admin operations).
 * HTTP 404.
 */
export class ContactRequestNotFoundError extends DomainError {
  readonly code = 'CONTACT_REQUEST_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(id: string) {
    super(`Solicitud de contacto no encontrada: ${id}`);
  }
}
