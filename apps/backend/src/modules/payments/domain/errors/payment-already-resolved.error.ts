import { DomainError } from '../../../../domain/errors/domain.error';
import type { PaymentStatus } from '../entities/consultation-payment.entity';

export class PaymentAlreadyResolvedError extends DomainError {
  readonly code = 'PAYMENT_ALREADY_RESOLVED';

  constructor(currentStatus: PaymentStatus) {
    super(`Este cobro ya fue resuelto (estado: ${currentStatus})`);
  }
}
