import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when attempting to approve a price_on_request consultation without
 * providing a base amount or at least one extra item.
 *
 * A consultation whose booking never fixed a price (amount=null, plan_price=null)
 * cannot be silently approved at $0. The doctor must supply the amount at
 * approval time, either as a manual base amount or via extra items.
 */
export class ConsultationAmountRequiredError extends DomainError {
  readonly code = 'CONSULTATION_AMOUNT_REQUIRED';

  constructor() {
    super('Debes ingresar un monto o agregar al menos un item para registrar el cobro');
  }
}
