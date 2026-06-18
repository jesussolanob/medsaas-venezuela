import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a share request has no sections enabled.
 * At least one of report, prescriptions, or ehr must be true.
 */
export class NoSectionsSelectedError extends DomainError {
  readonly code = 'NO_SECTIONS_SELECTED';
  override readonly httpStatus = 400;

  constructor() {
    super('Debe seleccionar al menos una sección para compartir');
  }
}
