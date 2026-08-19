import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor attempts to create a prescription linked to a patient
 * they do not own. Uses generic "not found" language to prevent resource-
 * existence enumeration.
 */
export class PatientNotOwnedError extends DomainError {
  readonly code = 'PATIENT_NOT_FOUND';

  constructor() {
    super('Paciente no encontrado');
  }
}
