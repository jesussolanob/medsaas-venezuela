import { DomainError } from '../../../../domain/errors/domain.error';

export class TransactionNotFoundError extends DomainError {
  readonly code = 'TRANSACTION_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Financial transaction not found');
  }
}
