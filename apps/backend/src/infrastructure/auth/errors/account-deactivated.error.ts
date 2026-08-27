import { DomainError } from '../../../domain/errors/domain.error';

/**
 * Thrown by AppAuthGuard when the authenticated profile has is_active = false
 * AND was switched off by its own owner (deactivated_by = 'self').
 *
 * Distinct from AccountBlockedError, which covers the admin ban. Both are the
 * same flag underneath and both map to 403, but a specialist who chose to leave
 * must not be told they "have been blocked" — that reads as a sanction and
 * generates a support ticket built on a misunderstanding.
 *
 * The code ACCOUNT_DEACTIVATED lets the portal branch its copy without parsing
 * the message text.
 *
 * The user-facing message is in es-VE as per project convention.
 */
export class AccountDeactivatedError extends DomainError {
  readonly code = 'ACCOUNT_DEACTIVATED';
  override readonly httpStatus = 403;

  constructor() {
    super('Diste de baja tu cuenta. Para reactivarla, contacta al administrador.');
  }
}
