import { DomainError } from '../../../../domain/errors/domain.error';

export class ConsultationPaymentNotOwnedError extends DomainError {
  readonly code = 'CONSULTATION_PAYMENT_NOT_OWNED';

  constructor() {
    super('No tenés permiso para ver o modificar este cobro');
  }
}
