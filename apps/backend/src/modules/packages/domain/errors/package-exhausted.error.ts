import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when a package has no remaining sessions to consume. */
export class PackageExhaustedError extends DomainError {
  readonly code = 'PACKAGE_EXHAUSTED';

  constructor(packageId: string) {
    super(`El combo ${packageId} no tiene sesiones disponibles`);
  }
}
