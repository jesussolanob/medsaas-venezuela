import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when attempting to reverse a movement that has already been reversed.
 *
 * The unique partial index on inventory_movements.reverses_movement_id
 * enforces this at the DB level. This error is raised in the application
 * layer for a user-friendly message before hitting the DB constraint.
 */
export class MovementAlreadyReversedError extends DomainError {
  readonly code = 'MOVEMENT_ALREADY_REVERSED';
  override readonly httpStatus = 422;

  constructor() {
    super('Este movimiento ya fue anulado y no puede anularse nuevamente.');
  }
}
