import { DomainError } from '../../../../domain/errors/domain.error';

export class OfficeNotFoundError extends DomainError {
  readonly code = 'OFFICE_NOT_FOUND';
  override readonly httpStatus = 404;

  // Intentionally generic — never include the ID to prevent resource enumeration.
  constructor() {
    super('Consultorio no encontrado');
  }
}
