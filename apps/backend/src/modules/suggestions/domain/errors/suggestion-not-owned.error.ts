import { DomainError } from '../../../../domain/errors/domain.error';

export class SuggestionNotOwnedError extends DomainError {
  readonly code = 'SUGGESTION_NOT_OWNED';
  override readonly httpStatus = 403;

  constructor() {
    super('Access denied to this suggestion');
  }
}
