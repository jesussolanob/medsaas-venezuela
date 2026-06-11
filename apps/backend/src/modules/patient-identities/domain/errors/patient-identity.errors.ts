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
    super('Patient identity already exists for this cedula hash');
  }
}
