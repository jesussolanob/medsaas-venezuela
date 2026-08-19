import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an operation would remove the last super_admin from the system,
 * leaving no one able to administer the platform.
 */
export class LastSuperAdminError extends DomainError {
  readonly code = 'LAST_SUPER_ADMIN';
  override readonly httpStatus = 422;

  constructor() {
    super('No se puede quitar el último administrador: debe quedar al menos uno');
  }
}
