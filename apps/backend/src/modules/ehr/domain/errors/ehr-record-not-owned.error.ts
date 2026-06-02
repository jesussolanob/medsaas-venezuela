import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor attempts to access an EHR record they don't own.
 *
 * Intentionally uses the same code and message as EhrRecordNotFoundError to
 * prevent resource-existence enumeration — a caller cannot distinguish between
 * "not found" and "found but not yours".
 */
export class EhrRecordNotOwnedError extends DomainError {
  readonly code = 'EHR_RECORD_NOT_FOUND';

  constructor() {
    super('EHR record not found');
  }
}
