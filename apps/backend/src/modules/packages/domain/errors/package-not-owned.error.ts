import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when the acting doctor does not own the referenced package. */
export class PackageNotOwnedError extends DomainError {
  readonly code = 'PACKAGE_NOT_OWNED';

  constructor(packageId: string) {
    super(`El combo ${packageId} no pertenece a este especialista`);
  }
}
