import { DomainError } from '../../../../domain/errors/domain.error';
import { fechaLegible } from '../appointment-status-names';

/**
 * Se lanza cuando el paciente YA tiene una cita que se solapa con el horario
 * pedido, con cualquier especialista — nadie puede estar en dos lugares a la vez.
 *
 * El mensaje decía «Patient <uuid> already has an appointment overlapping
 * 2026-08-19T17:27:44.419Z». Tres problemas en una línea: estaba en inglés,
 * imprimía una marca UTC con milisegundos que ni siquiera es la hora que se ve
 * en la agenda, y exponía el UUID del paciente en el navegador. El
 * `GlobalExceptionFilter` reenvía este texto tal cual.
 *
 * El id sigue disponible del lado del servidor por el `code`; no hace falta
 * mandarlo a la pantalla.
 */
export class AppointmentDuplicateError extends DomainError {
  readonly code = 'APPOINTMENT_DUPLICATE';

  constructor(_patientId: string, scheduledAt: Date) {
    super(
      `El paciente ya tiene una cita que se cruza con ese horario (${fechaLegible(scheduledAt)})`,
    );
  }
}
