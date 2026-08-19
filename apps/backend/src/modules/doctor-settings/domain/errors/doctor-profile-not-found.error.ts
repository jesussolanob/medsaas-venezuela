import { DomainError } from '../../../../domain/errors/domain.error';

export class DoctorProfileNotFoundError extends DomainError {
  readonly code = 'DOCTOR_PROFILE_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(_doctorId?: string) {
    super('Perfil del especialista no encontrado');
  }
}
