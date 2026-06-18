import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the authenticated doctor does not own the requested consultation.
 *
 * Returns 404 (not 403) to prevent existence enumeration.
 */
export class ConsultationNotOwnedError extends DomainError {
  readonly code = 'CONSULTATION_NOT_OWNED';
  override readonly httpStatus = 404;

  constructor() {
    super('La consulta no fue encontrada');
  }
}
