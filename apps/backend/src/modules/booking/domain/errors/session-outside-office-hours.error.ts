import { DomainError } from '../../../../domain/errors/domain.error';

/** Nombre en español para cada día de la semana (0=lunes … 6=domingo). */
const DAY_NAMES_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/**
 * Thrown when an additional (extra) multi-session appointment is requested for
 * a time slot that falls outside the office's enabled schedule blocks.
 *
 * HTTP 422 Unprocessable Entity: the request is syntactically valid, but the
 * business rule (session must fit inside an attended time window) is violated.
 *
 * This is defence in depth — the frontend slot picker enforces the same rule,
 * but the backend must be the hard gate.
 *
 * The caller is responsible for pre-computing `officeDay`, `timeHHMM`, and
 * `blocks` from the domain data so this class stays free of external imports.
 */
export class SessionOutsideOfficeHoursError extends DomainError {
  readonly code = 'SESSION_OUTSIDE_OFFICE_HOURS';
  override readonly httpStatus = 422;

  constructor(params: {
    /** Weekday (0=Monday … 6=Sunday) in America/Caracas local time. */
    officeDay: number;
    /** Local time in "HH:MM" format (America/Caracas). */
    timeHHMM: string;
    /** Enabled schedule blocks for that day. Empty = no blocks at all. */
    blocks: { start: string; end: string }[];
  }) {
    const dayName = DAY_NAMES_ES[params.officeDay] ?? 'ese día';

    let message: string;
    if (params.blocks.length === 0) {
      message = `El consultorio no tiene bloques de atención habilitados para el ${dayName}.`;
    } else {
      const rangesStr = params.blocks.map((b) => `${b.start}–${b.end}`).join(', ');
      message =
        `La sesión del ${dayName} a las ${params.timeHHMM} cae fuera del horario de atención ` +
        `(${rangesStr}). Elegí un horario dentro del bloque habilitado.`;
    }

    super(message);
  }
}
