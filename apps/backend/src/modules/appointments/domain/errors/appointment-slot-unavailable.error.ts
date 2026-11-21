import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Se lanza cuando el horario solicitado no está disponible en la agenda del
 * especialista (fuera del horario de atención, dentro de un bloque de
 * disponibilidad, o no alineado a la grilla de turnos).
 *
 * Código HTTP → 409 Conflict (via GlobalExceptionFilter + DomainError mapping).
 */
export class AppointmentSlotUnavailableError extends DomainError {
  readonly code = 'APPOINTMENT_SLOT_UNAVAILABLE';
  override readonly httpStatus = 409;

  constructor() {
    super('Ese horario ya no está disponible. Elige otro.');
  }
}
