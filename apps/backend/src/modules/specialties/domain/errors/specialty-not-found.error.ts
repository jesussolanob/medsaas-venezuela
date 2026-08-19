import { DomainError } from '../../../../domain/errors/domain.error';

export class SpecialtyNotFoundError extends DomainError {
  readonly code = 'SPECIALTY_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(id: string) {
    super(`No se encontró la especialidad con id "${id}"`);
  }
}
