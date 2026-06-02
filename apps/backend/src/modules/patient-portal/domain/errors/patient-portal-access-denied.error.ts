import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a patient attempts to access data that does not belong to their
 * auth_user_id. This is the IDOR guard for the patient portal layer.
 *
 * The message is intentionally generic — never include patient IDs or identifiers
 * to prevent resource-existence enumeration.
 */
export class PatientPortalAccessDeniedError extends DomainError {
  readonly code = 'PATIENT_PORTAL_ACCESS_DENIED';
  override readonly httpStatus = 403;

  constructor() {
    super('Access denied to this patient resource');
  }
}
