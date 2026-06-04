import { DomainError } from '../../../../domain/errors/domain.error';

export class AdminUserNotFoundError extends DomainError {
  readonly code = 'ADMIN_USER_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(userId?: string) {
    super(userId ? `User '${userId}' not found` : 'User not found');
  }
}
