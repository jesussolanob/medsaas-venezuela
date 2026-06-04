import { DomainError } from '../../../../domain/errors/domain.error';

export class PromotionNotFoundError extends DomainError {
  readonly code = 'PROMOTION_NOT_FOUND';
  override readonly httpStatus = 404;

  // Intentionally generic — never include the ID to prevent resource enumeration.
  constructor() {
    super('Promotion not found');
  }
}
