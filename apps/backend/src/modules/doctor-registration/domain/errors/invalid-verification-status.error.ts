import { DomainError } from '../../../../domain/errors/domain.error';

export class InvalidVerificationStatusError extends DomainError {
  readonly code = 'INVALID_VERIFICATION_STATUS';

  constructor(status: string) {
    super(`Invalid verification status: ${status}`);
  }
}
