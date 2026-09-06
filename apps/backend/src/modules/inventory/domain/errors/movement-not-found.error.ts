import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a movement does not exist or belongs to another doctor.
 *
 * Intentionally generic — the same error is returned for missing and
 * foreign movements to prevent resource enumeration (anti-IDOR).
 */
export class MovementNotFoundError extends DomainError {
  readonly code = 'MOVEMENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Movimiento no encontrado');
  }
}
