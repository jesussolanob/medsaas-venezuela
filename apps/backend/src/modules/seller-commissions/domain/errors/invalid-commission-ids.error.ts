import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the admin tries to register a payment for commission IDs that:
 *   - Do not belong to the specified seller (anti-IDOR), or
 *   - Are not in 'pending' status (anti-double-payment).
 *
 * Intentionally vague: does not reveal whether an ID belongs to another seller
 * or is already paid, to prevent enumeration of commission IDs.
 */
export class InvalidCommissionIdsError extends DomainError {
  readonly code = 'INVALID_COMMISSION_IDS';

  constructor() {
    super(
      'Una o más comisiones indicadas no son válidas, ya fueron pagadas, o no pertenecen a este vendedor.',
    );
  }
}
