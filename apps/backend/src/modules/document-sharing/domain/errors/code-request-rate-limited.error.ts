import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when request-code is called before the 60-second cooldown elapses.
 *
 * SECURITY: Returns 429 to signal rate limiting without exposing the exact
 * cooldown timestamp. Generic message prevents timing-based enumeration.
 */
export class CodeRequestRateLimitedError extends DomainError {
  readonly code = 'CODE_REQUEST_RATE_LIMITED';
  override readonly httpStatus = 429;

  constructor() {
    super('Demasiadas solicitudes. Intentá de nuevo en un momento.');
  }
}
