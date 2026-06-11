import { DomainError } from '../../../../domain/errors/domain.error';

/** Thrown when an office_id is provided but belongs to a different doctor. */
export class OfficeNotOwnedError extends DomainError {
  readonly code = 'OFFICE_NOT_OWNED';
  override readonly httpStatus = 403;

  constructor() {
    super('The specified office does not belong to this doctor');
  }
}
