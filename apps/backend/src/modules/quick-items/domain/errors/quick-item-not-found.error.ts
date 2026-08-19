import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a quick item does not exist or belongs to another doctor.
 *
 * Intentionally generic — never include the ID to prevent resource enumeration.
 */
export class QuickItemNotFoundError extends DomainError {
  readonly code = 'QUICK_ITEM_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Atajo no encontrado');
  }
}
