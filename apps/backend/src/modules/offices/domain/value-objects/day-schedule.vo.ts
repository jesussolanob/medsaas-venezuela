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

  private constructor(params: DayScheduleParams) {
    this.day = params.day;
    this.enabled = params.enabled;
    this.start = params.start;
    this.end = params.end;
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

    return new DaySchedule({
      day: obj['day'] as number,
      enabled: obj['enabled'] as boolean,
      start: obj['start'] as string,
      end: obj['end'] as string,
    });
  }
}
