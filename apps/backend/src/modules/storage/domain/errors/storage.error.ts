import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when a storage upload or signed-URL operation fails.
 * Mapped to HTTP 502 by GlobalExceptionFilter (external dependency failure).
 */
export class StorageUploadError extends DomainError {
  readonly code = 'STORAGE_UPLOAD_FAILED';
  override readonly httpStatus = 502;

  constructor(cause?: string) {
    super(cause ? `No se pudo subir el archivo: ${cause}` : 'No se pudo subir el archivo');
  }
}

/**
 * Raised when a file fails validation (size or content-type).
 * Mapped to HTTP 422 (default DomainError).
 */
export class StorageValidationError extends DomainError {
  readonly code = 'STORAGE_VALIDATION_FAILED';

  constructor(reason: string) {
    super(reason);
  }
}
