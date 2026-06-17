import { DomainError } from '../../../../domain/errors/domain.error';

export class IncomeConceptNotFoundError extends DomainError {
  readonly code = 'INCOME_CONCEPT_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Income concept not found');
  }
}
