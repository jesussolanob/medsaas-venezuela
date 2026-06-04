import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a PUT request tries to save a configuration with zero enabled blocks.
 * At least one block must remain active.
 */
export class EmptyBlockConfigError extends DomainError {
  readonly code = 'EMPTY_BLOCK_CONFIG';
  override readonly httpStatus = 400;

  constructor() {
    super('Debes tener al menos un bloque activo en tu configuración');
  }
}
