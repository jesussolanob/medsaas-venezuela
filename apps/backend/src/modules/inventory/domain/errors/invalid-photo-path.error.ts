import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when `photo_path` does not begin with `product/<doctorId>/`.
 *
 * Any other prefix means the path points to a file owned by another user
 * (e.g., a patient document) and must never be signed for the caller.
 */
export class InvalidPhotoPathError extends DomainError {
  readonly code = 'INVALID_PHOTO_PATH';

  constructor() {
    super('La ruta de la foto no es válida para este recurso.');
  }
}
