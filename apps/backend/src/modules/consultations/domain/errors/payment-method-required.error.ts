import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a consultation payment is approved without a payment method.
 *
 * Invariant: a cobro cannot be registered as paid/approved without specifying HOW it
 * was paid. Enforced at the domain layer so every approval path (Cobros drawer,
 * consultation editor modal, direct API) is covered — the frontend guards are only UX.
 */
export class PaymentMethodRequiredError extends DomainError {
  readonly code = 'PAYMENT_METHOD_REQUIRED';

  constructor() {
    super('Debes registrar un método de pago antes de aprobar el cobro');
  }
}
