import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a release note is not found.
 * HTTP 404.
 */
export class ReleaseNoteNotFoundError extends DomainError {
  readonly code = 'RELEASE_NOTE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(id: string) {
    super(`Novedad de versión no encontrada: ${id}`);
  }
}
