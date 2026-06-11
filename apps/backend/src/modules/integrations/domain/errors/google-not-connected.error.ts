import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a Google Calendar/Meet operation is attempted but the doctor
 * has not connected their Google account (or the env vars are absent).
 *
 * Callers catch this error to trigger the .ics + Jitsi fallback path.
 */
export class GoogleNotConnectedError extends DomainError {
  readonly code = 'GOOGLE_NOT_CONNECTED';
  override readonly httpStatus = 422;

  constructor(doctorId?: string) {
    super(
      doctorId
        ? `Doctor ${doctorId} has not connected a Google account`
        : 'Google integration is not configured',
    );
  }
}
