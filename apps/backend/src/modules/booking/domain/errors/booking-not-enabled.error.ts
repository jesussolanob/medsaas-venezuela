import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a booking request targets a doctor whose effective subscription
 * plan does not include the `booking` feature.
 *
 * HTTP 403 Forbidden: the caller is authenticated (or at least valid) but the
 * doctor's plan explicitly prohibits booking — not a "not found" scenario.
 *
 * This is defence-in-depth: the frontend already hides the booking link/QR
 * when `bookingEnabled=false`, but a direct POST to /api/booking must still
 * be rejected server-side.
 */
export class BookingNotEnabledError extends DomainError {
  readonly code = 'BOOKING_NOT_ENABLED';
  override readonly httpStatus = 403;

  constructor() {
    super('Este especialista no tiene habilitadas las reservas en línea');
  }
}
