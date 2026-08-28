import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a specialist referenced in a commission operation does not exist.
 * HTTP 422 — the resource should exist; a missing specialist is a data inconsistency.
 */
export class CommissionSpecialistNotFoundError extends DomainError {
  readonly code = 'COMMISSION_SPECIALIST_NOT_FOUND';

  constructor() {
    super('El especialista indicado no existe.');
  }
}
