import { DomainError } from '../../../../domain/errors/domain.error';

export class PatientAlreadyExistsError extends DomainError {
  readonly code = 'PATIENT_ALREADY_EXISTS';

  constructor(cedula: string) {
    super(`A patient with cédula '${cedula}' already exists for this doctor`);
  }
}
