import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the provided code does not match, is expired, used, or blocked.
 *
 * SECURITY: intentionally generic message — do not distinguish between
 * wrong code vs expired vs blocked to slow down enumeration.
 */
export class InvalidAccessCodeError extends DomainError {
  readonly code = 'INVALID_ACCESS_CODE';
  override readonly httpStatus = 422;

  constructor() {
    super('El código es inválido o ha expirado');
  }
}
