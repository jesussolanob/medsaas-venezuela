import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a payment is approved without a registered payment method.
 *
 * Invariant: a cobro cannot be marked as approved/paid without specifying HOW it was
 * paid. Enforced at the domain layer so every approval path is covered regardless of
 * which UI (or API caller) triggered it.
 */
export class PaymentMethodRequiredError extends DomainError {
  readonly code = 'PAYMENT_METHOD_REQUIRED';

  constructor() {
    super('Debes registrar un método de pago antes de aprobar el cobro');
  }
}
