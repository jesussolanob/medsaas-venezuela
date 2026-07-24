import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when the HMAC token supplied to a public pending-consultation endpoint
 * is invalid, expired (structurally), or does not resolve to a real record.
 *
 * Always maps to 404 to prevent token enumeration.
 */
export class PendingConsultationInvalidTokenError extends DomainError {
  override readonly code = 'PENDING_CONSULTATION_INVALID_TOKEN';
  override readonly httpStatus = 404;

  constructor() {
    super('Invalid or expired scheduling token');
  }
}
