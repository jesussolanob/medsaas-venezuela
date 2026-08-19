import { DomainError } from '../../../../domain/errors/domain.error';

export class PaymentAlreadyApprovedError extends DomainError {
  readonly code = 'PAYMENT_ALREADY_APPROVED';

  constructor() {
    super('El cobro de esta consulta ya fue aprobado');
  }
}
