import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a caller attempts to operate on a shared file they do not own.
 * Mapped to HTTP 403 by GlobalExceptionFilter via httpStatus override.
 */
export class SharedFileAccessDeniedError extends DomainError {
  readonly code = 'SHARED_FILE_ACCESS_DENIED';
  override readonly httpStatus = 403;

  constructor() {
    super('Access denied to this shared file');
  }
}
