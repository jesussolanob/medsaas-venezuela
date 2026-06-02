import { DomainError } from '../../../../domain/errors/domain.error';

export class DoctorNotFoundError extends DomainError {
  readonly code = 'DOCTOR_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_doctorId?: string) {
    super('Doctor not found');
  }
}
