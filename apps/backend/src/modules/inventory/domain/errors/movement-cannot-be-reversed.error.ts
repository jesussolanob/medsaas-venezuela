import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when attempting to manually reverse a consultation-linked movement.
 *
 * Movements with consultationId != null are owned by the billing flow
 * (approveWithExtras). Reversing them manually would silently desync
 * the consultation and the inventory ledger — ADR-054.
 */
export class MovementCannotBeReversedError extends DomainError {
  readonly code = 'MOVEMENT_CANNOT_BE_REVERSED';
  override readonly httpStatus = 422;

  constructor() {
    super(
      'Este movimiento está vinculado a un cobro y no puede anularse manualmente. ' +
        'Para corregirlo, reaprobá el cobro y el inventario se actualizará automáticamente.',
    );
  }
}
