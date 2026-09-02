import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an operation requires the quote to be in draft status
 * but it has already been sent (or is in a terminal state).
 */
export class QuoteAlreadySentError extends DomainError {
  readonly code = 'QUOTE_ALREADY_SENT';
  override readonly httpStatus = 409;

  constructor() {
    super('Solo las cotizaciones en borrador pueden ser modificadas o enviadas');
  }
}
