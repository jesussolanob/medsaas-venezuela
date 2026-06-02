import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when a patient package cannot be found by the given ID. */
export class PackageNotFoundError extends DomainError {
  readonly code = 'PACKAGE_NOT_FOUND';

  constructor(packageId?: string) {
    super(packageId ? `Package ${packageId} not found` : 'Package not found');
  }
}
