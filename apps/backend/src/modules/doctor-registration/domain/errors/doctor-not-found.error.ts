import { DomainError } from '../../../../domain/errors/domain.error';

export class DoctorRegistrationNotFoundError extends DomainError {
  readonly code = 'DOCTOR_REGISTRATION_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_doctorId?: string) {
    super('Perfil del especialista no encontrado');
  }
}
