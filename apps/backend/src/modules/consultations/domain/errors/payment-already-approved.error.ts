import { DomainError } from '../../../../domain/errors/domain.error';

export class PaymentAlreadyApprovedError extends DomainError {
  readonly code = 'PAYMENT_ALREADY_APPROVED';

  constructor() {
    super('Payment has already been approved for this consultation');
  }
}
