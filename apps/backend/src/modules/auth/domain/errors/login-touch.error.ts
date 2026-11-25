import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the profile targeted by a login touch cannot be found.
 * Maps to 404 Not Found.
 */
export class LoginTouchProfileNotFoundError extends DomainError {
  readonly code = 'LOGIN_TOUCH_PROFILE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_profileId: string) {
    super('No se encontró tu perfil. Intenta cerrar sesión y volver a entrar.');
  }
}
