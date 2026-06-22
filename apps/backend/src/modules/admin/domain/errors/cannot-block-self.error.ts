import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a super_admin tries to block their own account.
 * Prevents self-induced admin lockout.
 */
export class CannotBlockSelfError extends DomainError {
  readonly code = 'CANNOT_BLOCK_SELF';
  override readonly httpStatus = 422;

  constructor() {
    super('Cannot block your own account');
  }
}
