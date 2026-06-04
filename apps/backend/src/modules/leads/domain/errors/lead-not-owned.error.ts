import { DomainError } from '../../../../domain/errors/domain.error';

export class LeadNotOwnedError extends DomainError {
  readonly code = 'LEAD_NOT_OWNED';
  override readonly httpStatus = 403;

  constructor() {
    super('Lead does not belong to the authenticated doctor');
  }
}
