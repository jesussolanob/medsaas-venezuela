import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when a patient package has no remaining sessions to consume. */
export class InsufficientSessionsError extends DomainError {
  readonly code = 'INSUFFICIENT_SESSIONS';

  constructor(packageId: string) {
    super(`El combo ${packageId} no tiene sesiones disponibles`);
  }
}
