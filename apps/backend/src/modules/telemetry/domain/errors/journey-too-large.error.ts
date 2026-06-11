import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the journey for a session has already reached JOURNEY_HARD_LIMIT
 * and no further steps can be appended.
 *
 * Maps to HTTP 422 via the GlobalExceptionFilter.
 */
export class JourneyTooLargeError extends DomainError {
  readonly code = 'TELEMETRY_JOURNEY_TOO_LARGE';

  constructor(sessionId: string, limit: number) {
    super(
      `Session "${sessionId}" journey has reached the maximum of ${limit} steps — no further events will be stored`,
    );
  }
}
