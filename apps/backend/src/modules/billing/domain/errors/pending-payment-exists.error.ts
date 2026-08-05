import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor tries to submit a new payment while they already
 * have one in 'pending' status awaiting admin review.
 *
 * Anti-spam rule: one pending payment at a time.
 * Note: rate-limiting at the HTTP level is deferred to Etapa 2.
 *
 * Maps to HTTP 409 (conflict).
 */
export class PendingPaymentExistsError extends DomainError {
  readonly code = 'PENDING_PAYMENT_EXISTS';
  override readonly httpStatus = 409;

  constructor() {
    super(
      'Ya tenés un pago en revisión. Esperá a que lo procesemos antes de enviar otro comprobante.',
    );
  }
}
