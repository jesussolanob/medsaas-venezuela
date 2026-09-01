import { DomainError } from '../../../../domain/errors/domain.error';
import type { QuoteStatus } from '../entities/quote.entity';

/**
 * Thrown when a status transition violates the quote state machine.
 *
 * Valid transitions:
 *   draft → sent         (handled by SendQuoteUseCase)
 *   sent  → accepted
 *   sent  → rejected
 *   sent  → expired
 *
 * Any other transition (e.g. draft → accepted, accepted → rejected) is rejected
 * with this error so quotes can never have stale totals or misleading state.
 */
export class QuoteInvalidStatusTransitionError extends DomainError {
  readonly code = 'QUOTE_INVALID_STATUS_TRANSITION';
  override readonly httpStatus = 422;

  constructor(currentStatus: QuoteStatus, targetStatus: QuoteStatus) {
    super(
      `No se puede cambiar el estado de '${currentStatus}' a '${targetStatus}'. ` +
        `Solo las cotizaciones enviadas pueden marcarse como aceptadas, rechazadas o vencidas.`,
    );
  }
}
