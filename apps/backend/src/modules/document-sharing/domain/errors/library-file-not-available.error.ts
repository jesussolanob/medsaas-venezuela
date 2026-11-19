import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when one or more library file IDs in a share request cannot be resolved
 * to files owned by the requesting doctor (deleted, not found, or not owned).
 *
 * Returns 422 (not 404) to avoid leaking information about whether the file
 * belongs to another doctor.
 */
export class LibraryFileNotAvailableError extends DomainError {
  readonly code = 'LIBRARY_FILE_NOT_AVAILABLE';
  override readonly httpStatus = 422;

  constructor() {
    super(
      'Uno de los documentos frecuentes ya no está disponible. Actualiza la lista e inténtalo de nuevo.',
    );
  }
}
