import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor tries to access or modify a billing document
 * that does not belong to them (anti-IDOR).
 * Maps to HTTP 403 via GlobalExceptionFilter.
 */
export class BillingDocumentNotOwnedError extends DomainError {
  readonly code = 'BILLING_DOCUMENT_NOT_OWNED';
  override readonly httpStatus = 403;

  constructor(id: string) {
    super(`Billing document ${id} does not belong to the requesting doctor`);
  }
}
