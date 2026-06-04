import { DomainError } from '../../../../domain/errors/domain.error';

export class LeadNotFoundError extends DomainError {
  readonly code = 'LEAD_NOT_FOUND';
  override readonly httpStatus = 404;

  // Intentionally generic — never include the ID to prevent resource enumeration.
  constructor() {
    super('Lead not found');
  }
}
