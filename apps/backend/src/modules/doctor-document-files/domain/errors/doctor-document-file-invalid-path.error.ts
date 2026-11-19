import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the provided storage path does not start with the required
 * `document/<doctorId>/` prefix, or contains path traversal characters.
 *
 * This guards against IDOR: a doctor can only register paths that belong
 * to their own storage namespace.
 */
export class DoctorDocumentFileInvalidPathError extends DomainError {
  readonly code = 'DOCTOR_DOCUMENT_FILE_INVALID_PATH';
  override readonly httpStatus = 422;

  constructor() {
    super('La ruta del archivo no es válida. Debe pertenecer a tu espacio de almacenamiento.');
  }
}
