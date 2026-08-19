import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor attempts to access a prescription they do not own.
 *
 * Intentionally uses the same code and message as PrescriptionNotFoundError to
 * prevent resource-existence enumeration — a caller cannot distinguish between
 * "not found" and "found but not yours".
 */
export class PrescriptionAccessDeniedError extends DomainError {
  readonly code = 'PRESCRIPTION_NOT_FOUND';

  constructor() {
    super('Receta no encontrada');
  }
}
