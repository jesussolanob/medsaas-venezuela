import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a product does not exist or belongs to another doctor.
 *
 * Intentionally generic — never reveals the ID to prevent resource enumeration.
 * Returns 404 so the caller cannot distinguish missing vs. forbidden (anti-IDOR).
 */
export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Producto no encontrado');
  }
}
