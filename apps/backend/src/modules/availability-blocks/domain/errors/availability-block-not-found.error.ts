import { DomainError } from '../../../../domain/errors/domain.error';

export class AvailabilityBlockNotFoundError extends DomainError {
  readonly code = 'AVAILABILITY_BLOCK_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor() {
    super('Bloqueo de agenda no encontrado');
  }
}
