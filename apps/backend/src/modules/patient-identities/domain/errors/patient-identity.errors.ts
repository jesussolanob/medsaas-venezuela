import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Raised when a patient_identities INSERT fails because another concurrent
 * request already created the row for the same cedula_hash.
 * The caller should re-query findByCedulaHash to obtain the existing row.
 */
export class PatientIdentityConflictError extends DomainError {
  readonly code = 'PATIENT_IDENTITY_CONFLICT';
  override readonly httpStatus = 409;

  constructor() {
    super('Ya existe un paciente registrado con esa cédula');
  }
}

/**
 * Raised when a required domain invariant is violated during PatientIdentity
 * construction (e.g. empty cedulaHash or cedulaEncrypted).
 */
export class PatientIdentityInvariantError extends DomainError {
  readonly code = 'PATIENT_IDENTITY_INVARIANT';
  override readonly httpStatus = 422;

  constructor(field: string) {
    super(`Falta un dato obligatorio del paciente: ${field}`);
  }
}
