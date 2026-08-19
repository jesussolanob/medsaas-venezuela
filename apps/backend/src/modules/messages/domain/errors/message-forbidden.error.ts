import { DomainError } from '../../../../domain/errors/domain.error';

export class MessageForbiddenError extends DomainError {
  readonly code = 'MESSAGE_FORBIDDEN';
  override readonly httpStatus = 404;

  // Return 404 semantics to avoid confirming resource existence for unauthorized callers.
  constructor() {
    super('Conversación no encontrada');
  }
}
