import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a confirmation token is invalid, expired, or malformed.
 *
 * httpStatus 404 is deliberate anti-enumeration: we never confirm whether
 * an appointmentId exists to an unauthenticated caller.
 */
export class AppointmentConfirmInvalidTokenError extends DomainError {
  readonly code = 'APPOINTMENT_CONFIRM_INVALID_TOKEN';
  override readonly httpStatus = 404;

  constructor() {
    super('Appointment not found or confirmation link is invalid');
  }
}
