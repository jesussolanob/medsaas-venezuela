import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a quote is created with an invalid recipient combination:
 * exactly one of patient_id / lead_id must be provided (XOR).
 */
export class QuoteInvalidRecipientError extends DomainError {
  readonly code = 'QUOTE_INVALID_RECIPIENT';

  constructor() {
    super(
      'Una cotización debe tener exactamente un destinatario: un paciente o un cliente potencial (no ambos, no ninguno)',
    );
  }
}
