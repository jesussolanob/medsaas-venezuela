import { DomainError } from '../../../../domain/errors/domain.error';

export class BlockEndsBeforeStartsError extends DomainError {
  readonly code = 'BLOCK_ENDS_BEFORE_STARTS';
  override readonly httpStatus = 422;

  constructor() {
    super('La hora de fin del bloqueo debe ser posterior a la de inicio');
  }
}
