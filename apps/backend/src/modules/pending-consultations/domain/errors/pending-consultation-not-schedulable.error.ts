import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when a schedule attempt is made on a pending consultation that is
 * not in 'pending_scheduling' status or has already expired.
 */
export class PendingConsultationNotSchedulableError extends DomainError {
  override readonly code = 'PENDING_CONSULTATION_NOT_SCHEDULABLE';
  override readonly httpStatus = 422;

  constructor(_id?: string) {
    super('Esta consulta pendiente no puede agendarse en su estado actual.');
  }
}
