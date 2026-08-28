import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a seller_payment exists and is accessible but has no comprobante
 * attached (receipt_url IS NULL).
 *
 * This is distinct from SellerPaymentNotFoundError: the payment is found and owned,
 * but the admin never uploaded a receipt for it.
 */
export class SellerPaymentReceiptMissingError extends DomainError {
  readonly code = 'SELLER_PAYMENT_RECEIPT_MISSING';
  override readonly httpStatus = 404;

  constructor() {
    super('Este pago no tiene comprobante adjunto.');
  }
}
