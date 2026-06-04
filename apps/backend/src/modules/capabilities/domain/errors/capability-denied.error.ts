import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a user attempts an action they are not permitted to perform
 * according to the role_capabilities table.
 */
export class CapabilityDeniedError extends DomainError {
  readonly code = 'CAPABILITY_DENIED';
  override readonly httpStatus = 403;

  constructor(moduleKey: string, action: string) {
    super(
      `Access denied: action '${action}' on module '${moduleKey}' is not allowed for your role`,
    );
  }
}
