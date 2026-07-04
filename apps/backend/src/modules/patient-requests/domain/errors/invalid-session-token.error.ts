import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a session token is absent, malformed, expired, or does not
 * match the requested resource.
 *
 * SECURITY: intentionally generic — do not reveal which validation failed.
 */
export class InvalidSessionTokenError extends DomainError {
  readonly code = 'INVALID_SESSION_TOKEN';
  override readonly httpStatus = 422;

  constructor() {
    super('Sesión inválida o expirada. Por favor, verifica el código nuevamente.');
  }
}
