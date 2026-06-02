import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when a patient package has no remaining sessions to consume. */
export class InsufficientSessionsError extends DomainError {
  readonly code = 'INSUFFICIENT_SESSIONS';

  constructor(packageId: string) {
    super(`Package ${packageId} has no remaining sessions`);
  }
}
