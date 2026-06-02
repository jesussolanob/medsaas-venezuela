import { DomainError } from '../../../../domain/errors/domain.error';

export class EhrRecordNotFoundError extends DomainError {
  readonly code = 'EHR_RECORD_NOT_FOUND';

  // Message is intentionally generic — never include the ID to prevent
  // resource-existence enumeration by unauthorized callers.
  constructor() {
    super('EHR record not found');
  }
}
