import { DomainError } from '../../../domain/errors/domain.error';

/**
 * Thrown by AppAuthGuard when the authenticated profile has is_active = false.
 *
 * Maps to HTTP 403 Forbidden so the client can distinguish a hard account ban
 * from an authentication failure (401) or a role/capability denial (403 from
 * RolesGuard / CapabilitiesGuard).
 *
 * The user-facing message is in es-VE as per project convention.
 */
export class AccountBlockedError extends DomainError {
  readonly code = 'ACCOUNT_BLOCKED';
  override readonly httpStatus = 403;

  constructor() {
    super('Tu cuenta ha sido bloqueada. Contacta al administrador.');
  }
}
