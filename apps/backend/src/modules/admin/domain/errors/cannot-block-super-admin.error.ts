import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a super_admin tries to block another super_admin profile.
 * Prevents privilege escalation through lock-out.
 */
export class CannotBlockSuperAdminError extends DomainError {
  readonly code = 'CANNOT_BLOCK_SUPER_ADMIN';
  override readonly httpStatus = 422;

  constructor() {
    super('No se puede bloquear una cuenta de administrador');
  }
}
