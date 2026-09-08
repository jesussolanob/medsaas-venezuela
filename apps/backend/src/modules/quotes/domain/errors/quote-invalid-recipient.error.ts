import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a quote is created with an invalid recipient combination:
 * exactly one of patient_id / lead_id / new_recipient must be provided.
 */
export class QuoteInvalidRecipientError extends DomainError {
  readonly code = 'QUOTE_INVALID_RECIPIENT';

  constructor() {
    super(
      'Un presupuesto debe tener exactamente un destinatario: un paciente existente, ' +
        'un cliente potencial existente, o los datos de un destinatario nuevo (no más de uno, no ninguno)',
    );
  }
}
