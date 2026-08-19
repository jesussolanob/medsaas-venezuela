import { DomainError } from '../../../../domain/errors/domain.error';

export class AdminUserNotFoundError extends DomainError {
  readonly code = 'ADMIN_USER_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(userId?: string) {
    super(userId ? `Usuario '${userId}' no encontrado` : 'Usuario no encontrado');
  }
}
