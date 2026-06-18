import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a session token for document download is invalid,
 * expired, or does not correspond to the requested link.
 */
export class InvalidSessionTokenError extends DomainError {
  readonly code = 'INVALID_SESSION_TOKEN';
  override readonly httpStatus = 401;

  constructor() {
    super('El token de sesión es inválido o ha expirado');
  }
}
