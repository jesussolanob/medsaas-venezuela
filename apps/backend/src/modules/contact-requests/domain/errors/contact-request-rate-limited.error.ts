import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor exceeds the notification rate limit (3 per 24 h).
 * HTTP 429 — Too Many Requests.
 */
export class ContactRequestRateLimitedError extends DomainError {
  readonly code = 'CONTACT_REQUEST_RATE_LIMITED';
  override readonly httpStatus = 429;

  constructor() {
    super(
      'Has enviado demasiadas solicitudes de contacto en las últimas 24 horas. Intenta más tarde.',
    );
  }
}
