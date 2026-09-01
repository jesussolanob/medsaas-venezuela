import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a movement quantity violates domain rules (e.g. zero qty).
 */
export class InvalidQuantityError extends DomainError {
  readonly code = 'INVALID_QUANTITY';
  override readonly httpStatus = 422;

  constructor() {
    super('La cantidad del movimiento no puede ser cero');
  }
}
