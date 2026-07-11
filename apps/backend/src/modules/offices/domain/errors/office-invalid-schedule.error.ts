import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Maps the numeric day index (0-6) to a Spanish day name.
 * Convention used in this module: 0=Lunes … 6=Domingo.
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

export class OfficeInvalidScheduleError extends DomainError {
  readonly code = 'OFFICE_INVALID_SCHEDULE';
  override readonly httpStatus = 422;

  constructor(reason?: string) {
    super(reason ?? 'Configuración de horario inválida para este consultorio');
  }

  /**
   * Factory for self-overlap errors — produces a user-friendly Spanish message.
   */
  static selfOverlap(
    day: number,
    startA: string,
    endA: string,
    startB: string,
    endB: string,
  ): OfficeInvalidScheduleError {
    const dayName = DAY_NAMES_ES[day] ?? `día ${day}`;
    return new OfficeInvalidScheduleError(
      `Los bloques del día ${dayName} se solapan entre sí (${startA}-${endA} y ${startB}-${endB})`,
    );
  }

  /**
   * Factory for an invalid window (start >= end) on a given day.
   */
  static invalidWindow(day: number): OfficeInvalidScheduleError {
    const dayName = DAY_NAMES_ES[day] ?? `día ${day}`;
    return new OfficeInvalidScheduleError(
      `El horario del día ${dayName} tiene la hora de inicio mayor o igual a la hora de fin`,
    );
  }

  /**
   * Factory for a malformed schedule entry on a given day.
   */
  static invalidEntry(day: number): OfficeInvalidScheduleError {
    const dayName = DAY_NAMES_ES[day] ?? `día ${day}`;
    return new OfficeInvalidScheduleError(
      `Configuración de horario inválida para el día ${dayName}`,
    );
  }
}
