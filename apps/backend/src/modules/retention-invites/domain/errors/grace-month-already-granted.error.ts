import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when an admin tries to grant a grace month to a doctor who already
 * received one. Each doctor is entitled to at most one automated grace month.
 */
export class GraceMonthAlreadyGrantedError extends DomainError {
  readonly code = 'GRACE_MONTH_ALREADY_GRANTED';
  override readonly httpStatus = 409;
  constructor() {
    super('Este especialista ya recibió un mes de gracia.');
  }
}
