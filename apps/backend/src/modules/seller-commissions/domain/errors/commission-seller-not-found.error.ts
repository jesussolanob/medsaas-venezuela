import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a seller referenced in a commission operation does not exist
 * or is not active.
 */
export class CommissionSellerNotFoundError extends DomainError {
  readonly code = 'COMMISSION_SELLER_NOT_FOUND';

  constructor() {
    super('El vendedor indicado no existe o no está activo.');
  }
}
