import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when optimistic-lock retries are exhausted and a package session cannot
 * be decremented because of concurrent modification.
 */
export class PackageInsufficientSessionsError extends DomainError {
  readonly code = 'PACKAGE_INSUFFICIENT_SESSIONS';

  constructor(packageId: string) {
    super(`Package ${packageId} could not decrement sessions — exhausted or concurrently modified`);
  }
}
