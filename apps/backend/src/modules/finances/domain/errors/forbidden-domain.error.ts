import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an actor attempts an operation they are not authorized to perform.
 * Maps to HTTP 403 via GlobalExceptionFilter.
 */
export class ForbiddenDomainError extends DomainError {
  readonly code = 'FORBIDDEN';
  override readonly httpStatus = 403;

  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}
