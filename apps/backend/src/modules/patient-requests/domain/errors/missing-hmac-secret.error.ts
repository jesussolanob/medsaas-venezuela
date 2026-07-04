import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when AUTH_RESOLVE_SECRET is absent at token-signing/verification time.
 *
 * This is a configuration error — surfaces as HTTP 500.
 * Never use a fallback secret.
 */
export class MissingHmacSecretError extends DomainError {
  readonly code = 'MISSING_HMAC_SECRET';
  override readonly httpStatus = 500;

  constructor() {
    super('AUTH_RESOLVE_SECRET is not configured. Generate one with: openssl rand -hex 32');
  }
}
