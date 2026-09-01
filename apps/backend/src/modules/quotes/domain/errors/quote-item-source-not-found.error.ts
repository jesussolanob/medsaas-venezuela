import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a quote item references a source (product or service) that does
 * not exist or belongs to another doctor.
 *
 * Returns 404 — intentionally generic, does not reveal whether the ID is
 * invalid or belongs to a different doctor (anti-IDOR).
 */
export class QuoteItemSourceNotFoundError extends DomainError {
  readonly code = 'QUOTE_ITEM_SOURCE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(kind: 'product' | 'service', sourceId: string) {
    super(
      `El ${kind === 'product' ? 'producto' : 'servicio'} referenciado no fue encontrado (id: ${sourceId})`,
    );
  }
}
