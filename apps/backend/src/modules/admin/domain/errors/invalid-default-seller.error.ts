import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the caller attempts to set a default seller ID that does not
 * belong to an active seller profile.
 *
 * Covers three cases:
 *   - UUID does not match any profile
 *   - profile has a role other than 'seller'
 *   - profile has is_active = false
 */
export class InvalidDefaultSellerError extends DomainError {
  readonly code = 'INVALID_DEFAULT_SELLER';
  override readonly httpStatus = 422;

  constructor() {
    super('El vendedor predeterminado no existe o no está activo');
  }
}
