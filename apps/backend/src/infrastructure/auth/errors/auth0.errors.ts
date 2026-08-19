import { DomainError } from '../../../domain/errors/domain.error';

/**
 * Thrown when the Auth0 token header is absent or cannot be parsed.
 * Maps to 401 Unauthorized.
 */
export class Auth0TokenMissingError extends DomainError {
  readonly code = 'AUTH0_TOKEN_MISSING';
  override readonly httpStatus = 401;

  constructor() {
    super('Tu sesión no es válida. Volvé a iniciar sesión.');
  }
}

/**
 * Thrown when jose fails to verify the JWT (expired, wrong audience, bad signature, etc).
 * Maps to 401 Unauthorized.
 *
 * The internal rejection reason from jose is intentionally NOT included in the
 * public message to avoid information disclosure. The caller should log it separately.
 */
export class Auth0TokenInvalidError extends DomainError {
  readonly code = 'AUTH0_TOKEN_INVALID';
  override readonly httpStatus = 401;

  constructor() {
    super('Tu sesión expiró. Volvé a iniciar sesión.');
  }
}

/**
 * Thrown when the ID token does not carry an email claim.
 * Maps to 401 Unauthorized.
 */
export class Auth0EmailMissingError extends DomainError {
  readonly code = 'AUTH0_EMAIL_MISSING';
  override readonly httpStatus = 401;

  constructor() {
    super('No pudimos leer tu correo de la sesión. Volvé a iniciar sesión.');
  }
}

/**
 * Thrown at boot time when AUTH0_DOMAIN or AUTH0_CLIENT_ID is missing in auth0 mode.
 * Results in 503 Service Unavailable when auth0 mode is active and config is absent.
 */
export class Auth0ConfigMissingError extends DomainError {
  readonly code = 'AUTH0_CONFIG_MISSING';
  override readonly httpStatus = 503;

  constructor(missingVar: string) {
    super(`Auth0 mode is active but required env var is not set: ${missingVar}`);
  }
}
