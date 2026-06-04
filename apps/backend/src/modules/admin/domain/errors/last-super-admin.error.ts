import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an operation would remove the last super_admin from the system,
 * leaving no one able to administer the platform.
 */
export class LastSuperAdminError extends DomainError {
  readonly code = 'LAST_SUPER_ADMIN';
  override readonly httpStatus = 422;

  constructor() {
    super('Cannot demote the last super_admin — at least one super_admin must remain');
  }
}
