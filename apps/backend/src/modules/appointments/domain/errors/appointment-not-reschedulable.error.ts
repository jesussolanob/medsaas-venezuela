import { DomainError } from '../../../../domain/errors/domain.error';
import { ESTADOS_FINALES, nombreDeEstado } from '../appointment-status-names';

/**
 * Se lanza al intentar reagendar una cita que no está en un estado reagendable
 * (solo `scheduled` y `confirmed` lo son).
 *
 * El mensaje estaba ENTERO EN INGLÉS: «Cannot reschedule an appointment in
 * status "completed". Only scheduled or confirmed appointments can be
 * rescheduled.» El `GlobalExceptionFilter` lo reenvía tal cual, así que eso es
 * lo que veía el especialista al mover una cita ya cerrada.
 */
export class AppointmentNotReschedulableError extends DomainError {
  readonly code = 'APPOINTMENT_NOT_RESCHEDULABLE';
  override readonly httpStatus = 409;

  constructor(currentStatus: string) {
    super(AppointmentNotReschedulableError.mensaje(currentStatus));
  }

  /**
   * Explica por qué no se puede y qué hacer, en vez de enumerar los estados
   * que sí sirven — que al especialista no le dicen nada.
   */
  private static mensaje(estado: string): string {
    const nombre = nombreDeEstado(estado);

    if (ESTADOS_FINALES.has(estado)) {
      return (
        `Esta cita ya quedó ${nombre}, y una cita cerrada no se puede mover de fecha. ` +
        `Si el paciente vuelve, agendale una cita nueva.`
      );
    }

    return `Una cita ${nombre} no se puede reagendar.`;
  }
}
