import { DomainError } from '../../../../domain/errors/domain.error';
import type { PaymentStatus } from '../entities/consultation-payment.entity';

export class PaymentAlreadyResolvedError extends DomainError {
  readonly code = 'PAYMENT_ALREADY_RESOLVED';

  constructor(currentStatus: PaymentStatus) {
    super(`Payment has already been resolved with status: ${currentStatus}`);
  }
}
