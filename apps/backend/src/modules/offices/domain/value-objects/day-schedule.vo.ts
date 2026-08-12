/**
 * DaySchedule value object.
 *
 * Represents a single day's schedule configuration for a doctor's office.
 * day: 0=Monday … 6=Sunday (NOT JS getDay() which is 0=Sunday).
 *
 * No external imports — pure domain logic.
 */

export interface DayScheduleParams {
  day: number; // 0=Monday … 6=Sunday
  enabled: boolean;
  start: string; // HH:MM (24h)
  end: string; // HH:MM (24h)
  /**
   * Duración de la consulta EN ESTE BLOQUE, en minutos.
   *
   * Opcional a propósito: cuando no viene, manda la duración del consultorio
   * (`office.slotDuration`), que es como funcionaba antes. Así los horarios ya
   * guardados siguen valiendo tal cual y no hace falta migrar el JSONB.
   *
   * Existe porque un mismo consultorio puede tener bloques con ritmos distintos
   * — por ejemplo primeras consultas de 45' en la mañana y controles de 20' en
   *   la tarde — y un servicio solo debería poder asociarse a un consultorio que
   *   tenga algún bloque capaz de sostener su duración.
   */
  slotDuration?: number;
  /** Minutos entre consultas en este bloque. Sin valor, manda el del consultorio. */
  bufferMinutes?: number;
}

/** Límites de cordura para los overrides por bloque. */
const MIN_SLOT_MINUTES = 5;
const MAX_SLOT_MINUTES = 480;
const MAX_BUFFER_MINUTES = 120;

/**
 * Lee un override opcional de minutos. Devuelve `undefined` cuando no viene, y
 * `null` cuando viene pero es inválido — para que el llamador pueda distinguir
 * "no lo mandó" de "lo mandó mal" y rechazar el segundo caso.
 */
function readOptionalMinutes(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

const HH_MM_REGEX = /^\d{2}:\d{2}$/;

/** Parse "HH:MM" into total minutes from midnight. */
function parseMinutes(time: string): number {
  const parts = time.split(':');
  const hStr = parts[0] ?? '0';
  const mStr = parts[1] ?? '0';
  return parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
}

/** Format total minutes from midnight as "HH:MM". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class DaySchedule {
  readonly day: number;
  readonly enabled: boolean;
  readonly start: string;
  readonly end: string;
  readonly slotDuration?: number;
  readonly bufferMinutes?: number;

  private constructor(params: DayScheduleParams) {
    this.day = params.day;
    this.enabled = params.enabled;
    this.start = params.start;
    this.end = params.end;
    this.slotDuration = params.slotDuration;
    this.bufferMinutes = params.bufferMinutes;
  }

  /** Duración efectiva del bloque: la propia si la tiene, si no la del consultorio. */
  effectiveSlotDuration(officeSlotDuration: number): number {
    return this.slotDuration ?? officeSlotDuration;
  }

  /** Minutos entre consultas efectivos: los propios si los tiene, si no los del consultorio. */
  effectiveBufferMinutes(officeBufferMinutes: number): number {
    return this.bufferMinutes ?? officeBufferMinutes;
  }

  /** Cuántas consultas entran en el bloque con la duración efectiva. */
  capacity(officeSlotDuration: number, officeBufferMinutes: number): number {
    if (!this.hasValidWindow()) return 0;
    const dur = this.effectiveSlotDuration(officeSlotDuration);
    const paso = dur + this.effectiveBufferMinutes(officeBufferMinutes);
    if (dur <= 0 || paso <= 0) return 0;
    let cuenta = 0;
    let actual = this.startMinutes();
    while (actual + dur <= this.endMinutes()) {
      cuenta += 1;
      actual += paso;
    }
    return cuenta;
  }

  /** Returns true when start and end times form a valid window. */
  hasValidWindow(): boolean {
    if (!this.enabled) return true; // disabled days don't need valid windows
    return parseMinutes(this.start) < parseMinutes(this.end);
  }

  /** Returns start time in minutes from midnight. */
  startMinutes(): number {
    return parseMinutes(this.start);
  }

  /** Returns end time in minutes from midnight. */
  endMinutes(): number {
    return parseMinutes(this.end);
  }

  static create(params: DayScheduleParams): DaySchedule {
    return new DaySchedule(params);
  }

  /** Validates raw data and returns a DaySchedule or null on validation failure. */
  static validate(raw: unknown): DaySchedule | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const obj = raw as Record<string, unknown>;

    if (typeof obj['day'] !== 'number') return null;
    if (obj['day'] < 0 || obj['day'] > 6 || !Number.isInteger(obj['day'])) return null;
    if (typeof obj['enabled'] !== 'boolean') return null;
    if (typeof obj['start'] !== 'string' || !HH_MM_REGEX.test(obj['start'])) return null;
    if (typeof obj['end'] !== 'string' || !HH_MM_REGEX.test(obj['end'])) return null;

    // Overrides opcionales: ausentes es lo normal (el bloque hereda del
    // consultorio); presentes pero inválidos invalidan el bloque entero, para no
    // guardar en la BD un horario con una duración imposible.
    const slotDuration = readOptionalMinutes(
      obj['slotDuration'],
      MIN_SLOT_MINUTES,
      MAX_SLOT_MINUTES,
    );
    if (slotDuration === null) return null;
    const bufferMinutes = readOptionalMinutes(obj['bufferMinutes'], 0, MAX_BUFFER_MINUTES);
    if (bufferMinutes === null) return null;

    return new DaySchedule({
      day: obj['day'] as number,
      enabled: obj['enabled'] as boolean,
      start: obj['start'] as string,
      end: obj['end'] as string,
      ...(slotDuration !== undefined ? { slotDuration } : {}),
      ...(bufferMinutes !== undefined ? { bufferMinutes } : {}),
    });
  }
}
