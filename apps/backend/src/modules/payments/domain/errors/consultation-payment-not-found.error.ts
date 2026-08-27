import { DomainError } from '../../../../domain/errors/domain.error';

export class ConsultationPaymentNotFoundError extends DomainError {
  readonly code = 'CONSULTATION_PAYMENT_NOT_FOUND';
  override readonly httpStatus = 404;

  // Message is intentionally generic — never include the ID to prevent
  // resource-existence enumeration by unauthorized callers.
  constructor() {
    super('Cobro no encontrado');
  }
}
