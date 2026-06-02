import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when a package has no remaining sessions to consume. */
export class PackageExhaustedError extends DomainError {
  readonly code = 'PACKAGE_EXHAUSTED';

  constructor(packageId: string) {
    super(`Package ${packageId} has no remaining sessions`);
  }
}
