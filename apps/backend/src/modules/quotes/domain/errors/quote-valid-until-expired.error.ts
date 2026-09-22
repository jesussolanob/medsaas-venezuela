import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a specialist tries to send (or re-send) a quote whose
 * valid_until date is already in the past.
 *
 * The error message is shown directly on the send form — it must name the
 * problem AND tell the specialist what they can do about it (ADR-075).
 */
export class QuoteValidUntilExpiredError extends DomainError {
  readonly code = 'QUOTE_VALID_UNTIL_EXPIRED';

  constructor() {
    super(
      'La fecha de vigencia ya venció. Actualizá la fecha de vigencia del presupuesto para poder enviarlo.',
    );
  }
}
