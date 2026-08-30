import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a caller whose role is not 'seller' attempts to self-deactivate
 * via POST /api/seller/deactivate.
 *
 * HTTP 403 — the caller is authenticated but is not authorised to use this path.
 *
 * This is enforced by both the RolesGuard (which gates on 'seller' before the
 * use case is reached) and the use case itself (defence in depth).
 */
export class CannotDeactivateSellerRoleError extends DomainError {
  readonly code = 'CANNOT_DEACTIVATE_SELLER_ROLE';
  override readonly httpStatus = 403;

  constructor() {
    super('Solo una cuenta de vendedor puede darse de baja por esta vía.');
  }
}
