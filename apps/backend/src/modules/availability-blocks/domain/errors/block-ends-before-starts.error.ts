import { DomainError } from '../../../../domain/errors/domain.error';

export class BlockEndsBeforeStartsError extends DomainError {
  readonly code = 'BLOCK_ENDS_BEFORE_STARTS';
  override readonly httpStatus = 422;

  constructor() {
    super('Block ends_at must be strictly after starts_at');
  }
}
