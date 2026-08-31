import { DomainError } from '../../../../domain/errors/domain.error';
import { fechaLegible } from '../appointment-status-names';

/** Se lanza cuando otro paciente ya ocupa ese horario del especialista. */
export class AppointmentConflictError extends DomainError {
  readonly code = 'APPOINTMENT_CONFLICT';

  constructor(scheduledAt: Date) {
    // La hora va LEGIBLE y en horario de Caracas: antes se imprimía el
    // `toISOString()` crudo y el especialista leía "El horario de las
    // 2026-08-19T17:27:44.419Z ya está ocupado".
    super(`Ya hay una cita ocupando ese horario (${fechaLegible(scheduledAt)})`);
  }
}
