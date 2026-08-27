import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when a pending consultation cannot be found by ID.
 * Returns 404 on public endpoints (anti-enumeration).
 */
export class PendingConsultationNotFoundError extends DomainError {
  override readonly code = 'PENDING_CONSULTATION_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(id?: string) {
    super(id ? `Consulta por agendar ${id} no encontrada` : 'Consulta por agendar no encontrada');
  }
}
