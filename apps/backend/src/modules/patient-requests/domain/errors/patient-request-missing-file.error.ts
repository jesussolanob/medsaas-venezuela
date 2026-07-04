import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a multipart upload request arrives with no attached file.
 *
 * Maps to HTTP 422 (default DomainError status).
 */
export class PatientRequestMissingFileError extends DomainError {
  readonly code = 'PATIENT_REQUEST_MISSING_FILE';

  constructor() {
    super('Debes adjuntar un archivo');
  }
}
