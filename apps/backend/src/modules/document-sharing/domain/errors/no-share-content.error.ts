import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a share request has no document types AND no attachments.
 * At least one type must be selected OR at least one attachment must be provided.
 */
export class NoShareContentError extends DomainError {
  readonly code = 'NO_SHARE_CONTENT';
  override readonly httpStatus = 400;

  constructor() {
    super('Debe seleccionar al menos un tipo de documento o un archivo adjunto para compartir');
  }
}
