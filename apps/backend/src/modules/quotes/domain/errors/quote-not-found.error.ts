import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a quote does not exist or belongs to another doctor.
 *
 * Intentionally generic — never reveals the ID. Returns 404 so the caller
 * cannot distinguish missing vs. forbidden (anti-IDOR guarantee).
 */
export class QuoteNotFoundError extends DomainError {
  readonly code = 'QUOTE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Cotización no encontrada');
  }
}
