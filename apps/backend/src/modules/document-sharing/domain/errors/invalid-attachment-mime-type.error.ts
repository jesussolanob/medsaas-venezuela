import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an upload attachment in a share request uses a MIME type that is
 * not in the allowed set (application/pdf, image/jpeg, image/png, image/webp).
 */
export class InvalidAttachmentMimeTypeError extends DomainError {
  readonly code = 'INVALID_ATTACHMENT_MIME_TYPE';
  override readonly httpStatus = 422;

  constructor() {
    super('Solo puedes adjuntar PDF o imágenes (JPG, PNG o WEBP).');
  }
}
