import { DomainError } from '../../../../domain/errors/domain.error';

export class PatientNotFoundError extends DomainError {
  readonly code = 'PATIENT_NOT_FOUND';

  // Message is intentionally generic — never include the patientId in the response
  // to prevent resource-existence enumeration by unauthorized callers.
  constructor(_patientId?: string) {
    super('Paciente no encontrado');
  }
}
