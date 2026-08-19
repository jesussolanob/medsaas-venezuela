import { DomainError } from '../../../../domain/errors/domain.error';

export class SpecialtyConflictError extends DomainError {
  readonly code = 'SPECIALTY_CONFLICT';
  override readonly httpStatus = 409;

  constructor(name: string) {
    super(`Ya existe una especialidad llamada "${name}"`);
  }
}
