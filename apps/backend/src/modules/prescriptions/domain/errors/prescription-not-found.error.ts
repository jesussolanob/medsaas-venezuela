import { DomainError } from '../../../../domain/errors/domain.error';

export class PrescriptionNotFoundError extends DomainError {
  readonly code = 'PRESCRIPTION_NOT_FOUND';

  // Message is intentionally generic — never include the ID to prevent
  // resource-existence enumeration by unauthorized callers.
  constructor() {
    super('Receta no encontrada');
  }
}
