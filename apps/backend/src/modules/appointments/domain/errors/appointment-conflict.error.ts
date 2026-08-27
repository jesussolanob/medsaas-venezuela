import { DomainError } from '../../../../domain/errors/domain.error';

/** Raised when a doctor slot is already occupied by another appointment. */
export class AppointmentConflictError extends DomainError {
  readonly code = 'APPOINTMENT_CONFLICT';

  constructor(scheduledAt: Date) {
    // La hora se muestra LEGIBLE y en horario de Caracas. Antes se imprimía el
    // `toISOString()` crudo y el especialista leía "El horario de las
    // 2026-08-19T17:27:44.419Z ya está ocupado": una marca de tiempo UTC con
    // milisegundos, que además no es la hora que él ve en su agenda.
    const hora = new Intl.DateTimeFormat('es-VE', {
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Caracas',
    }).format(scheduledAt);
    super(`Ya hay una cita ocupando ese horario (${hora})`);
  }
}
