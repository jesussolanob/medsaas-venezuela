import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor document file is not found or does not belong to the
 * requesting doctor.
 *
 * Returns 404 (not 422) so callers cannot enumerate other doctors' files.
 */
export class DoctorDocumentFileNotFoundError extends DomainError {
  readonly code = 'DOCTOR_DOCUMENT_FILE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Archivo no encontrado');
  }
}
