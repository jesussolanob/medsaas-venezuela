import { DomainError } from '../../../../domain/errors/domain.error';
import { DoctorDocumentFile } from '../entities/doctor-document-file.entity';

/**
 * Thrown when a doctor tries to add a file to their library but has already
 * reached the maximum number of active (non-deleted) files.
 */
export class DoctorDocumentFileLimitExceededError extends DomainError {
  readonly code = 'DOCTOR_DOCUMENT_FILE_LIMIT_EXCEEDED';
  override readonly httpStatus = 422;

  constructor() {
    super(
      `Has alcanzado el límite de ${DoctorDocumentFile.MAX_FILES_PER_DOCTOR} documentos frecuentes. ` +
        `Elimina alguno antes de agregar uno nuevo.`,
    );
  }
}
