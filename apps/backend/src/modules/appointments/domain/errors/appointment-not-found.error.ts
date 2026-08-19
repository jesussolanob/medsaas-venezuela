import { DomainError } from '../../../../domain/errors/domain.error';

export class AppointmentNotFoundError extends DomainError {
  readonly code = 'APPOINTMENT_NOT_FOUND';

  constructor(appointmentId: string) {
    super(`Cita no encontrada: ${appointmentId}`);
  }
}
