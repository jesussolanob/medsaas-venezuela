import { DomainError } from '../../../../domain/errors/domain.error';

export class MessageNotFoundError extends DomainError {
  readonly code = 'MESSAGE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Conversación no encontrada');
  }
}
