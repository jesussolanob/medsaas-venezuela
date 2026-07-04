import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when request-code is called before the 60-second cooldown elapses.
 */
export class CodeRequestRateLimitedError extends DomainError {
  readonly code = 'CODE_REQUEST_RATE_LIMITED';
  override readonly httpStatus = 429;

  constructor() {
    super('Demasiadas solicitudes. Intentá de nuevo en un momento.');
  }
}
