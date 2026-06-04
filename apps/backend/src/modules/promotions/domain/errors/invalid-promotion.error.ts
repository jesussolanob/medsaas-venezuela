import { DomainError } from '../../../../domain/errors/domain.error';

export class InvalidPromotionError extends DomainError {
  readonly code = 'INVALID_PROMOTION';
  override readonly httpStatus = 400;

  constructor(reason: string) {
    super(`Invalid promotion: ${reason}`);
  }
}
