import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a public quote link is expired or has been revoked.
 *
 * Returns 404 (not 410 Gone) to avoid leaking whether the token ever existed.
 */
export class QuoteLinkExpiredError extends DomainError {
  readonly code = 'QUOTE_LINK_EXPIRED';
  override readonly httpStatus = 404;

  constructor() {
    super('El enlace de cotización no es válido o ha vencido');
  }
}
