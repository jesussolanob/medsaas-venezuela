import { DomainError } from '../../../../domain/errors/domain.error';

export class DoctorServiceNotFoundError extends DomainError {
  readonly code = 'DOCTOR_SERVICE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_serviceId?: string) {
    super('Servicio no encontrado');
  }
}
