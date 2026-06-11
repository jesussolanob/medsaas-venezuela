import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the caller submits more events than the allowed batch limit.
 * Maps to HTTP 422 via the GlobalExceptionFilter.
 */
export class BatchTooLargeError extends DomainError {
  readonly code = 'TELEMETRY_BATCH_TOO_LARGE';

  constructor(received: number, max: number) {
    super(`Telemetry batch too large: received ${received}, max allowed ${max}`);
  }
}
