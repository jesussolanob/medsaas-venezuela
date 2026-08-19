import { DomainError } from '../../../../domain/errors/domain.error';

export class LeadNotOwnedError extends DomainError {
  readonly code = 'LEAD_NOT_OWNED';
  override readonly httpStatus = 403;

  constructor() {
    super('Ese contacto no pertenece a este especialista');
  }
}
