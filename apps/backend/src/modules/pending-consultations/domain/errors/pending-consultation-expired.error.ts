import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised specifically when a scheduling attempt is rejected because the
 * pending consultation's expires_at date has passed.
 */
export class PendingConsultationExpiredError extends DomainError {
  override readonly code = 'PENDING_CONSULTATION_EXPIRED';
  override readonly httpStatus = 422;

  constructor(_id?: string) {
    super('La consulta pendiente ya no puede agendarse porque venció su fecha límite.');
  }
}
