import { DomainError } from '../../../../domain/errors/domain.error';

/** Thrown when an office_id is provided but belongs to a different doctor. */
export class OfficeNotOwnedError extends DomainError {
  readonly code = 'OFFICE_NOT_OWNED';
  override readonly httpStatus = 403;

  constructor() {
    super('Ese consultorio no pertenece a este especialista');
  }
}
