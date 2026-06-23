import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when a doctor profile cannot be found for the given id.
 * Maps to HTTP 404 via GlobalExceptionFilter.
 */
export class DoctorNotFoundError extends DomainError {
  readonly code = 'DOCTOR_NOT_FOUND';
  override readonly httpStatus = 404;

  constructor(doctorId: string) {
    super(`Doctor no encontrado: ${doctorId}`);
  }
}
