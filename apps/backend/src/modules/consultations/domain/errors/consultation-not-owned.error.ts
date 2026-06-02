import { DomainError } from '../../../../domain/errors/domain.error';

export class ConsultationNotOwnedError extends DomainError {
  readonly code = 'CONSULTATION_NOT_OWNED';

  constructor() {
    super('Not authorized to access or modify this consultation');
  }
}
