import { DomainError } from '../../../../domain/errors/domain.error';

export class InvalidVerificationStatusError extends DomainError {
  readonly code = 'INVALID_VERIFICATION_STATUS';

  constructor(status: string) {
    super(`Estado de verificación inválido: ${status}`);
  }
}
