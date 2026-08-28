import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a seller_payment does not exist OR does not belong to the requesting
 * seller.
 *
 * SECURITY: the same error is used for both "not found" and "not owned" cases to
 * prevent a seller from enumerating payments that belong to other sellers by observing
 * whether the error is 404 vs 403.  Admin endpoints do not need this protection and
 * may use a 404 as well — both cases surface the same error.
 */
export class SellerPaymentNotFoundError extends DomainError {
  readonly code = 'SELLER_PAYMENT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('El pago indicado no existe.');
  }
}
