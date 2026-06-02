import { DomainError } from '../../../../domain/errors/domain.error';

export class DoctorServiceNotOwnedError extends DomainError {
  readonly code = 'DOCTOR_SERVICE_NOT_OWNED';
  override readonly httpStatus = 403;

  constructor() {
    super('You do not own this service');
  }
}
