import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a shared file is not found, or the caller is not authorized
 * to access it (anti-IDOR: same error for both cases to avoid enumeration).
 */
export class SharedFileNotFoundError extends DomainError {
  readonly code = 'SHARED_FILE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Shared file not found');
  }
}
