import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an operation requires an active product but the product is inactive.
 */
export class ProductInactiveError extends DomainError {
  readonly code = 'PRODUCT_INACTIVE';
  override readonly httpStatus = 422;

  constructor() {
    super('El producto está inactivo y no puede tener movimientos de venta');
  }
}
