import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Maps the numeric day index (0-6) to a Spanish day name.
 * Convention used in this module: 0=Lunes … 6=Domingo (ISO weekday minus 1).
 */
const DAY_NAMES_ES: Readonly<Record<number, string>> = {
  0: 'Lunes',
  1: 'Martes',
  2: 'Miércoles',
  3: 'Jueves',
  4: 'Viernes',
  5: 'Sábado',
  6: 'Domingo',
};

/**
 * Thrown when a new or updated office schedule overlaps with an existing
 * active office for the same doctor.
 *
 * Two time windows on the same day overlap when:
 *   startA < endB AND startB < endA (half-open interval comparison).
 *
 * HTTP 409 Conflict — the client should adjust schedule times before retrying.
 */
export class OfficeScheduleConflictError extends DomainError {
  readonly code = 'OFFICE_SCHEDULE_CONFLICT';
  override readonly httpStatus = 409;

  constructor(day?: number) {
    const dayName = day !== undefined ? (DAY_NAMES_ES[day] ?? `día ${day}`) : undefined;
    const dayLabel = dayName ? ` del día ${dayName}` : '';
    super(`El horario${dayLabel} se solapa con otro consultorio activo de este especialista.`);
  }
}
