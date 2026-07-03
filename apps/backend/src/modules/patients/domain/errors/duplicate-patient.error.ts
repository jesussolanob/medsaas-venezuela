import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor tries to create a patient whose cédula already
 * belongs to an existing patient in their own roster.
 *
 * HTTP 409 Conflict — the resource already exists; the client should not repeat
 * the exact same request without resolution (e.g. look up the existing patient).
 *
 * Code: PATIENT_DUPLICATE (machine-readable, stable across releases).
 *
 * Scope: per-doctor — the same cédula held by a patient under a DIFFERENT doctor
 * does NOT trigger this error (each doctor's roster is independent).
 */
export class DuplicatePatientError extends DomainError {
  readonly code = 'PATIENT_DUPLICATE';
  override readonly httpStatus = 409;

  constructor(cedula: string) {
    super(
      `Ya existe un paciente con la cédula '${cedula}' en tu listado. ` +
        `Busca el paciente existente para registrar una nueva consulta.`,
    );
  }
}
