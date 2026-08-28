import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a seller profile cannot be located by the given id.
 *
 * HTTP 404 — the resource does not exist from the caller's perspective.
 *
 * SECURITY: the message does not distinguish between "profile doesn't exist"
 * and "profile exists but has a different role" to avoid leaking enumerable
 * user ids to unauthorized callers.
 */
export class SellerNotFoundError extends DomainError {
  readonly code = 'SELLER_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('No se encontró el perfil de vendedor solicitado.');
  }
}
