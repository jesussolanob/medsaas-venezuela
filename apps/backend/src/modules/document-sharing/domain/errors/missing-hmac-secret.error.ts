import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown at startup / token-signing time when AUTH_RESOLVE_SECRET is absent.
 *
 * This is a configuration error, not a user error. It surfaces as a 500
 * (the GlobalExceptionFilter maps undefined httpStatus to 500 via its default).
 * Never use a fallback secret — that would silently allow anyone to forge tokens.
 */
export class MissingHmacSecretError extends DomainError {
  readonly code = 'MISSING_HMAC_SECRET';

  constructor() {
    super('AUTH_RESOLVE_SECRET is not configured. ' + 'Generate one with: openssl rand -hex 32');
  }
}
