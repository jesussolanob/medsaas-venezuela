import { DomainError } from '../../../../domain/errors/domain.error';

export class ConsultationNotOwnedError extends DomainError {
  readonly code = 'CONSULTATION_NOT_OWNED';

  constructor() {
    super('No tenés permiso para ver o modificar esta consulta');
  }
}
