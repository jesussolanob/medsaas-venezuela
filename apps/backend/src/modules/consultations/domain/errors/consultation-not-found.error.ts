import { DomainError } from '../../../../domain/errors/domain.error';

export class ConsultationNotFoundError extends DomainError {
  readonly code = 'CONSULTATION_NOT_FOUND';

  // Message is intentionally generic — never include the ID in the response
  // to prevent resource-existence enumeration by unauthorized callers.
  constructor() {
    super('Consultation not found');
  }
}
