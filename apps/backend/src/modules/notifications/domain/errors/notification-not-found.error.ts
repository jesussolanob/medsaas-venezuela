import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a notification does not exist or belongs to another doctor.
 *
 * Returns 404 so the caller cannot distinguish missing vs. forbidden
 * (anti-IDOR guarantee — same pattern as QuoteNotFoundError).
 */
export class NotificationNotFoundError extends DomainError {
  readonly code = 'NOTIFICATION_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Notificación no encontrada');
  }
}
