import { DomainError } from '../../../../domain/errors/domain.error';

export class PatientAlreadyExistsError extends DomainError {
  readonly code = 'PATIENT_ALREADY_EXISTS';

  constructor(cedula: string) {
    super(`Ya tenés un paciente registrado con la cédula '${cedula}'`);
  }
}
