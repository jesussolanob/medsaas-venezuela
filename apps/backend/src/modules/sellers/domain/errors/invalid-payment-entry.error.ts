import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a payment_details entry fails validation:
 *   - one or more field values are not strings, or
 *   - an entry is completely empty (all values are blank / missing).
 *
 * HTTP 422 (inherited from DomainError).
 *
 * SECURITY: the message does NOT echo the actual field values —
 * financial data must never appear in error responses or logs.
 */
export class InvalidPaymentEntryError extends DomainError {
  readonly code = 'INVALID_PAYMENT_ENTRY';

  constructor(method: string) {
    super(
      `Los datos de cobro del método '${method}' son inválidos: ` +
        `todos los campos deben ser texto y al menos uno debe tener un valor.`,
    );
  }
}
