import { DomainError } from '../../../../domain/errors/domain.error';

export class ConsultationPaymentNotOwnedError extends DomainError {
  readonly code = 'CONSULTATION_PAYMENT_NOT_OWNED';

  constructor() {
    super('Not authorized to access or modify this payment');
  }
}
