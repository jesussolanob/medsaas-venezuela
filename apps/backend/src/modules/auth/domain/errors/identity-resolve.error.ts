import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the AUTH_RESOLVE_SECRET env var is not configured.
 * Maps to 503 Service Unavailable (fail-closed: server misconfiguration).
 */
export class ResolveSecretNotConfiguredError extends DomainError {
  readonly code = 'RESOLVE_SECRET_NOT_CONFIGURED';
  override readonly httpStatus = 503;

  constructor() {
    super('No se pudo validar tu identidad por un problema de configuración del servidor.');
  }
}

/**
 * Thrown when the caller provides a wrong or missing x-internal-auth-secret header.
 * Maps to 401 Unauthorized.
 */
export class ResolveSecretInvalidError extends DomainError {
  readonly code = 'RESOLVE_SECRET_INVALID';
  override readonly httpStatus = 401;

  constructor() {
    super('Invalid or missing internal authentication secret');
  }
}
