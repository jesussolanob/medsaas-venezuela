import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a profile whose role is not 'doctor' hits the self-deactivation
 * endpoint.
 *
 * Self-deactivation is a specialist-facing feature. A super_admin switching
 * their own account off would lock themselves out of the very panel used to
 * switch accounts back on — the same lockout that CannotBlockSelfError guards
 * against on the admin side.
 *
 * HTTP 422 (inherited from DomainError).
 */
export class CannotDeactivateRoleError extends DomainError {
  readonly code = 'CANNOT_DEACTIVATE_ROLE';

  constructor() {
    super('Esta cuenta no puede darse de baja desde aquí.');
  }
}
